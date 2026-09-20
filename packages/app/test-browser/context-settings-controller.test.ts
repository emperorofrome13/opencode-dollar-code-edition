import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { createContextSettingsController, type ContextSettingsSource, type ContextSettingsStatus } from "../src/components/context-settings-controller"

const status = (directory: string, compactSkillsOverride: boolean | null = null): ContextSettingsStatus => ({
  directory,
  configFile: `${directory}/.opencode/opencode.jsonc`,
  dcpFile: `${directory}/.opencode/dcp.jsonc`,
  compactSkills: false,
  compactSkillsOverride,
  dcp: true,
  registered: true,
  manualMode: false,
  automaticStrategies: true,
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

async function settled() {
  await new Promise<void>((resolve) => queueMicrotask(resolve))
  await new Promise<void>((resolve) => queueMicrotask(resolve))
  await new Promise<void>((resolve) => queueMicrotask(resolve))
}

describe("project context settings controller", () => {
  test("ignores stale reads after switching projects", async () => {
    const old = deferred<ContextSettingsStatus>()
    const owned = createRoot((dispose) => {
      const [source, setSource] = createStore<ContextSettingsSource>({
        directory: "old", protocol: Promise.resolve("v1"),
        read: (directory) => directory === "old" ? old.promise : Promise.resolve(status(directory, true)),
        write: async (directory) => status(directory),
      })
      return { dispose, setSource, controller: createContextSettingsController(() => ({ ...source })) }
    })
    await settled()
    owned.setSource("directory", "new")
    await settled()
    expect(owned.controller.state.data?.directory).toBe("new")
    expect(owned.controller.state.data?.compactSkillsOverride).toBe(true)
    old.resolve(status("old", false))
    await settled()
    expect(owned.controller.state.data?.directory).toBe("new")
    expect(owned.controller.state.data?.compactSkillsOverride).toBe(true)
    owned.dispose()
  })

  test("does not optimistically check a failed save and exposes an actionable error", async () => {
    const owned = createRoot((dispose) => ({
      dispose,
      controller: createContextSettingsController(() => ({
        directory: "project", protocol: Promise.resolve("v1"),
        read: async () => status("project", false),
        write: async () => { throw new Error("Permission denied") },
      })),
    }))
    await settled()
    await owned.controller.set("compactSkills", true)
    expect(owned.controller.state.data?.compactSkillsOverride).toBe(false)
    expect(owned.controller.state.error).toBe("save")
    expect(owned.controller.state.detail).toBe("Permission denied")
    expect(owned.controller.state.saved).toBe(false)
    expect(owned.controller.state.saving).toBe(false)
    owned.dispose()
  })

  test("ignores a stale save and prevents simultaneous writes", async () => {
    const pending = deferred<ContextSettingsStatus>()
    const writes: string[] = []
    const owned = createRoot((dispose) => {
      const [source, setSource] = createStore<ContextSettingsSource>({
        directory: "old", protocol: Promise.resolve("v1"),
        read: async (directory) => status(directory, false),
        write: (directory) => { writes.push(directory); return pending.promise },
      })
      return { dispose, setSource, controller: createContextSettingsController(() => ({ ...source })) }
    })
    await settled()
    const saving = owned.controller.set("compactSkills", true)
    await owned.controller.set("dcp", false)
    expect(writes).toEqual(["old"])
    owned.setSource("directory", "new")
    await settled()
    pending.resolve(status("old", true))
    await saving
    expect(owned.controller.state.data?.directory).toBe("new")
    expect(owned.controller.state.data?.compactSkillsOverride).toBe(false)
    expect(owned.controller.state.saved).toBe(false)
    owned.dispose()
  })

  test("V2 and missing projects never call the settings API", async () => {
    const calls: string[] = []
    const owned = createRoot((dispose) => ({
      dispose,
      controller: createContextSettingsController(() => ({
        directory: "project", protocol: Promise.resolve("v2"),
        read: async () => { calls.push("read"); return status("project") },
        write: async () => { calls.push("write"); return status("project") },
      })),
    }))
    await settled()
    expect(owned.controller.state.unsupported).toBe(true)
    await owned.controller.set("compactSkills", true)
    expect(calls).toEqual([])
    owned.dispose()
  })

  test("saved values survive refresh while runtime status remains unchanged", async () => {
    let disk = status("project", false)
    const owned = createRoot((dispose) => ({
      dispose,
      controller: createContextSettingsController(() => ({
        directory: "project", protocol: Promise.resolve("v1"),
        read: async () => disk,
        write: async (_, setting, enabled) => {
          disk = { ...disk, ...(setting === "compactSkills" ? { compactSkillsOverride: enabled } : { [setting]: enabled }) }
          return disk
        },
      })),
    }))
    await settled()
    await owned.controller.set("compactSkills", true)
    expect(owned.controller.state.saved).toBe(true)
    await owned.controller.refresh()
    expect(owned.controller.state.data?.compactSkillsOverride).toBe(true)
    expect(owned.controller.state.data?.compactSkills).toBe(false)
    owned.dispose()
  })
})
