import { describe, expect, test } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { Effect } from "effect"
import { parse } from "jsonc-parser"
import { ContextSettings } from "../../src/config/context-settings"
import { tmpdir } from "../fixture/fixture"

const config = { plugin: ["@tarquinen/opencode-dcp@3.1.15"], experimental: { skill_index_names_only: true } }

describe("project context settings files", () => {
  test("preserves JSONC, permissions, registration and unrelated keys across all toggles", async () => {
    await using tmp = await tmpdir()
    const directory = path.join(tmp.path, ".opencode")
    await fs.mkdir(directory)
    const compact = '{\n  // keep registration\n  "plugin": ["./node_modules/@tarquinen/opencode-dcp"],\n  "experimental": { "skill_index_names_only": true, "batch_tool": true, },\n}\n'
    const dcp = '{\n  // keep permission\n  "enabled": true,\n  "autoUpdate": false,\n  "compress": { "permission": "ask", "protectUserMessages": true, },\n  "manualMode": { "enabled": false, "automaticStrategies": true },\n}\n'
    await Bun.write(path.join(directory, "opencode.jsonc"), compact)
    await Bun.write(path.join(directory, "dcp.jsonc"), dcp)
    for (const setting of ["compactSkills", "dcp", "manualMode", "automaticStrategies"] as const) {
      const enabled = setting === "manualMode"
      const result = await Effect.runPromise(ContextSettings.update(tmp.path, "/", config, { setting, enabled }))
      expect(setting === "compactSkills" ? result.compactSkillsOverride : result[setting]).toBe(enabled)
    }
    const text = await Bun.file(path.join(directory, "opencode.jsonc")).text()
    expect(text).toContain("// keep registration")
    expect(parse(text)).toEqual({ plugin: ["./node_modules/@tarquinen/opencode-dcp"], experimental: { skill_index_names_only: false, batch_tool: true } })
    const pruning = await Bun.file(path.join(directory, "dcp.jsonc")).text()
    expect(pruning).toContain("// keep permission")
    expect(parse(pruning)).toEqual({ enabled: false, autoUpdate: false, compress: { permission: "ask", protectUserMessages: true }, manualMode: { enabled: true, automaticStrategies: false } })
    const reopened = await Effect.runPromise(ContextSettings.get(tmp.path, "/", config))
    expect(reopened).toMatchObject({ compactSkills: true, compactSkillsOverride: false, dcp: false, manualMode: true, automaticStrategies: false })
    expect(await Bun.file(path.join(tmp.path, "config.json")).exists()).toBe(false)
  })

  test("preserves dcp.json fallback when creating higher-priority dcp.jsonc", async () => {
    await using tmp = await tmpdir()
    await Bun.write(path.join(tmp.path, ".opencode/dcp.json"), JSON.stringify({ enabled: true, autoUpdate: false, compress: { permission: "ask" }, manualMode: { enabled: true } }))
    await Effect.runPromise(ContextSettings.update(tmp.path, "/", config, { setting: "dcp", enabled: false }))
    expect(await Bun.file(path.join(tmp.path, ".opencode/dcp.jsonc")).json()).toEqual({ enabled: false, autoUpdate: false, compress: { permission: "ask" }, manualMode: { enabled: true } })
    expect((await Bun.file(path.join(tmp.path, ".opencode/dcp.json")).json()).enabled).toBe(true)
  })

  test("tolerates a UTF-8 BOM and rewrites the file without it", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, ".opencode/dcp.jsonc")
    await Bun.write(file, new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('{ "enabled": true }')]))
    const result = await Effect.runPromise(ContextSettings.update(tmp.path, "/", config, { setting: "dcp", enabled: false }))
    expect(result.dcp).toBe(false)
    expect(await Bun.file(file).json()).toEqual({ enabled: false })
  })

  test("refuses malformed settings and leaves their bytes untouched", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, ".opencode/dcp.jsonc")
    const text = '{ "enabled": true,, }'
    await Bun.write(file, text)
    const outcome = await Effect.runPromise(ContextSettings.update(tmp.path, "/", config, { setting: "dcp", enabled: false })).then(
      () => "resolved" as const,
      () => "rejected" as const,
    )
    expect(outcome).toBe("rejected")
    expect(await Bun.file(file).text()).toBe(text)
  })

  test("serializes concurrent changes without losing independent fields", async () => {
    await using tmp = await tmpdir()
    await Promise.all([
      Effect.runPromise(ContextSettings.update(tmp.path, "/", config, { setting: "manualMode", enabled: true })),
      Effect.runPromise(ContextSettings.update(tmp.path, "/", config, { setting: "automaticStrategies", enabled: false })),
    ])
    expect(await Bun.file(path.join(tmp.path, ".opencode/dcp.jsonc")).json()).toEqual({ manualMode: { enabled: true, automaticStrategies: false } })
  })

  test("uses the nearest project config within a worktree and never a parent outside it", async () => {
    await using tmp = await tmpdir()
    await fs.mkdir(path.join(tmp.path, ".opencode"))
    const child = path.join(tmp.path, "child")
    await fs.mkdir(child)
    const shared = await Effect.runPromise(ContextSettings.get(child, tmp.path, config))
    expect(shared.directory).toBe(tmp.path)
    const isolated = await Effect.runPromise(ContextSettings.get(child, "/", config))
    expect(isolated.directory).toBe(child)
  })
})
