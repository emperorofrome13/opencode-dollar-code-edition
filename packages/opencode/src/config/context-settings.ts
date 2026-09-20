export * as ContextSettings from "./context-settings"

import path from "path"
import os from "os"
import fs from "fs/promises"
import { Effect, Schema, Semaphore } from "effect"
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Global } from "@opencode-ai/core/global"
import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import { ConfigPlugin } from "./plugin"
import { isRecord } from "@/util/record"

export const Patch = Schema.Struct({
  setting: Schema.Literals(["compactSkills", "dcp", "manualMode", "automaticStrategies", "rtk"]),
  enabled: Schema.Boolean,
})

export const Status = Schema.Struct({
  directory: Schema.String,
  configFile: Schema.String,
  dcpFile: Schema.String,
  compactSkills: Schema.Boolean,
  compactSkillsOverride: Schema.NullOr(Schema.Boolean),
  dcp: Schema.Boolean,
  registered: Schema.Boolean,
  manualMode: Schema.Boolean,
  automaticStrategies: Schema.Boolean,
  rtk: Schema.Boolean,
})

const lock = Semaphore.makeUnsafe(1)

async function read(file: string) {
  const text = await fs.readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (text === undefined) return undefined
  const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const errors: ParseError[] = []
  const value: unknown = parse(normalized, errors, { allowTrailingComma: true })
  if (errors.length || !isRecord(value)) throw new Error(`Invalid JSONC object: ${file}`)
  return { text: normalized, value }
}

async function preferred(directory: string) {
  return (await read(path.join(directory, "dcp.jsonc"))) ?? (await read(path.join(directory, "dcp.json")))
}

async function location(directory: string, worktree: string) {
  if (Flag.OPENCODE_DISABLE_PROJECT_CONFIG) throw new Error("Project configuration is disabled by the server")
  const root = worktree === "/" ? directory : worktree
  let current = directory
  while (true) {
    const candidate = path.join(current, ".opencode")
    const info = await fs.lstat(candidate).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw error
    })
    if (info) {
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Not a regular project directory: ${candidate}`)
      return candidate
    }
    if (current === root || path.dirname(current) === current) return path.join(directory, ".opencode")
    const parent = path.dirname(current)
    if (path.relative(root, parent).startsWith("..")) return path.join(directory, ".opencode")
    current = parent
  }
}

function boolean(value: unknown, fallback: boolean, field: string) {
  if (value === undefined) return fallback
  if (typeof value !== "boolean") throw new Error(`Expected a boolean: ${field}`)
  return value
}

async function status(directory: string, worktree: string, config: ConfigV1.Info) {
  const target = await location(directory, worktree)
  const shared = [Global.Path.config, path.join(Global.Path.home, ".opencode"), process.env.OPENCODE_CONFIG_DIR].filter((value): value is string => !!value)
  if (shared.some((value) => path.relative(path.resolve(value), target) === "")) {
    throw new Error("These controls cannot write shared user or server configuration")
  }
  const local = await read(path.join(target, "opencode.jsonc"))
  const json = await read(path.join(target, "opencode.json"))
  const experimental = local?.value.experimental ?? json?.value.experimental
  if (experimental !== undefined && !isRecord(experimental)) throw new Error("Invalid project experimental settings")
  const override = local?.value.experimental && isRecord(local.value.experimental)
    ? local.value.experimental.skill_index_names_only
    : undefined
  const inherited = json?.value.experimental && isRecord(json.value.experimental)
    ? json.value.experimental.skill_index_names_only
    : undefined
  const compact = override ?? inherited
  const global = process.env.XDG_CONFIG_HOME
    ? path.join(process.env.XDG_CONFIG_HOME, "opencode")
    : path.join(os.homedir(), ".config", "opencode")
  const layers = [
    await preferred(global),
    process.env.OPENCODE_CONFIG_DIR ? await preferred(process.env.OPENCODE_CONFIG_DIR) : undefined,
    await preferred(target),
  ]
  const dcp = layers.reduce((result, layer) => {
    if (!layer) return result
    const manual = layer.value.manualMode
    if (manual !== undefined && !isRecord(manual)) throw new Error("Invalid DCP manualMode settings")
    return {
      dcp: boolean(layer.value.enabled, result.dcp, "enabled"),
      manualMode: boolean(manual?.enabled, result.manualMode, "manualMode.enabled"),
      automaticStrategies: boolean(manual?.automaticStrategies, result.automaticStrategies, "manualMode.automaticStrategies"),
    }
  }, { dcp: true, manualMode: false, automaticStrategies: true })
  const plugins = (config.plugin ?? []).map((spec) => ConfigPlugin.pluginSpecifier(spec).replaceAll("\\", "/"))
  const filePlugins = (local && Array.isArray(local.value.plugin) ? local.value.plugin : undefined)
    ?? (json && Array.isArray(json.value.plugin) ? json.value.plugin : undefined)
  const fileRtk = filePlugins === undefined
    ? undefined
    : filePlugins.some((spec) => typeof spec === "string" && /(?:^|\/)opencode-rtk(?:@|\/|$)/.test(spec.replaceAll("\\", "/")))
  const effectiveRtk = plugins.some((spec) => /(?:^|\/)opencode-rtk(?:@|\/|$)/.test(spec))
  return {
    directory: path.dirname(target),
    configFile: path.join(target, "opencode.jsonc"),
    dcpFile: path.join(target, "dcp.jsonc"),
    compactSkills: config.experimental?.skill_index_names_only ?? false,
    compactSkillsOverride: compact === undefined ? null : boolean(compact, false, "skill_index_names_only"),
    registered: plugins.some((spec) => /(?:^|\/)@tarquinen\/opencode-dcp(?:@|\/|$)/.test(spec)),
    ...dcp,
    rtk: fileRtk ?? effectiveRtk,
  }
}

export function get(directory: string, worktree: string, config: ConfigV1.Info) {
  return Effect.tryPromise(() => status(directory, worktree, config)).pipe(lock.withPermits(1))
}

const RTK_SPECIFIER = "./node_modules/opencode-rtk"

function rtkConfigured(value: unknown) {
  if (!Array.isArray(value)) return false
  return value.some(
    (spec) => typeof spec === "string" && /(?:^|\/)opencode-rtk(?:@|\/|$)/.test(spec.replaceAll("\\", "/")),
  )
}

async function writeDocument(file: string, text: string) {
  const target = path.dirname(file)
  await fs.mkdir(target, { recursive: true })
  if ((await fs.realpath(target)) !== path.join(await fs.realpath(path.dirname(target)), ".opencode")) {
    throw new Error("Project settings directory must not be a symbolic link")
  }
  const info = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (info && (!info.isFile() || info.isSymbolicLink())) throw new Error("Project settings must be a regular file")
  const temporary = `${file}.${crypto.randomUUID()}.tmp`
  await fs.writeFile(temporary, text, { flag: "wx", mode: info?.mode ?? 0o600 })
  await fs.rename(temporary, file).catch(async (error) => {
    await fs.unlink(temporary)
    throw error
  })
}

async function updateRtk(configFile: string, enabled: boolean) {
  const document = await read(configFile)
  const text = document?.text ?? "{\n}\n"
  const current = document && Array.isArray(document.value.plugin)
    ? document.value.plugin.filter((spec): spec is string => typeof spec === "string")
    : []
  const next = enabled
    ? rtkConfigured(current)
      ? current
      : [...current, RTK_SPECIFIER]
    : current.filter((spec) => !/(?:^|\/)opencode-rtk(?:@|\/|$)/.test(spec.replaceAll("\\", "/")))
  const updated = applyEdits(text, modify(text, ["plugin"], next, {
    formattingOptions: { insertSpaces: true, tabSize: 2, eol: text.includes("\r\n") ? "\r\n" : "\n" },
  }))
  if (updated !== text) await writeDocument(configFile, updated)
}

export function update(directory: string, worktree: string, config: ConfigV1.Info, patch: typeof Patch.Type) {
  return Effect.tryPromise(async () => {
    const before = await status(directory, worktree, config)
    if (patch.setting !== "compactSkills" && patch.setting !== "rtk" && !before.registered) {
      throw new Error("DCP is not registered in the effective configuration")
    }
    if (patch.setting === "rtk") {
      await updateRtk(before.configFile, patch.enabled)
      return status(directory, worktree, config)
    }
    const file = patch.setting === "compactSkills" ? before.configFile : before.dcpFile
    const target = path.dirname(file)
    await fs.mkdir(target, { recursive: true })
    if ((await fs.realpath(target)) !== path.join(await fs.realpath(path.dirname(target)), ".opencode")) {
      throw new Error("Project settings directory must not be a symbolic link")
    }
    const info = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw error
    })
    if (info && (!info.isFile() || info.isSymbolicLink())) throw new Error("Project settings must be a regular file")
    const document = (await read(file)) ?? (patch.setting !== "compactSkills" ? await preferred(target) : undefined)
    const field = patch.setting === "compactSkills"
      ? ["experimental", "skill_index_names_only"]
      : patch.setting === "dcp" ? ["enabled"]
      : ["manualMode", patch.setting === "manualMode" ? "enabled" : "automaticStrategies"]
    const text = document?.text ?? "{\n}\n"
    const next = applyEdits(text, modify(text, field, patch.enabled, {
      formattingOptions: { insertSpaces: true, tabSize: 2, eol: text.includes("\r\n") ? "\r\n" : "\n" },
    }))
    if (next !== text) {
      const temporary = `${file}.${crypto.randomUUID()}.tmp`
      await fs.writeFile(temporary, next, { flag: "wx", mode: info?.mode ?? 0o600 })
      await fs.rename(temporary, file).catch(async (error) => {
        await fs.unlink(temporary)
        throw error
      })
    }
    return status(directory, worktree, config)
  }).pipe(lock.withPermits(1))
}
