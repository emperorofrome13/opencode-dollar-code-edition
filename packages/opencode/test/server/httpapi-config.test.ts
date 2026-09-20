import { afterEach, describe, expect } from "bun:test"
import path from "path"
import { Server } from "../../src/server/server"
import { Effect, Fiber } from "effect"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"
import { it } from "../lib/effect"
import { waitGlobalBusEvent } from "./global-bus"

function app() {
  return Server.Default().app
}

function waitDisposed(directory: string) {
  return waitGlobalBusEvent({
    message: "timed out waiting for instance disposal",
    predicate: (event) => event.payload.type === "server.instance.disposed" && event.directory === directory,
  })
}

const tmpdirEffect = (options: Parameters<typeof tmpdir>[0]) =>
  Effect.acquireRelease(
    Effect.promise(() => tmpdir(options)),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  )

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

describe("config HttpApi", () => {
  it.live(
    "exposes DCP defaults and persists compact skills in project JSONC without changing runtime state",
    Effect.gen(function* () {
      const tmp = yield* tmpdirEffect({ config: { formatter: false, lsp: false } })
      const headers = { "content-type": "application/json", "x-opencode-directory": tmp.path }
      const initial = yield* Effect.promise(() => Promise.resolve(app().request("/config/context-settings", { headers })))
      expect(initial.status).toBe(200)
      expect(yield* Effect.promise(() => initial.json())).toMatchObject({
        directory: tmp.path,
        dcp: true,
        registered: false,
        manualMode: false,
        automaticStrategies: true,
        compactSkills: false,
        compactSkillsOverride: null,
      })
      const response = yield* Effect.promise(() => Promise.resolve(app().request("/config/context-settings", {
        method: "PATCH", headers, body: JSON.stringify({ setting: "compactSkills", enabled: true }),
      })))
      expect(response.status).toBe(200)
      expect(yield* Effect.promise(() => response.json())).toMatchObject({ compactSkills: false, compactSkillsOverride: true })
      expect(yield* Effect.promise(() => Bun.file(path.join(tmp.path, ".opencode/opencode.jsonc")).json())).toEqual({
        experimental: { skill_index_names_only: true },
      })
      expect(yield* Effect.promise(() => Bun.file(path.join(tmp.path, "config.json")).exists())).toBe(false)
      const reopened = yield* Effect.promise(() => Promise.resolve(app().request("/config/context-settings", { headers })))
      expect(yield* Effect.promise(() => reopened.json())).toMatchObject({ compactSkills: false, compactSkillsOverride: true })
      const missing = yield* Effect.promise(() => Promise.resolve(app().request("/config/context-settings", {
        method: "PATCH", headers, body: JSON.stringify({ setting: "dcp", enabled: false }),
      })))
      expect(missing.status).toBe(400)
      expect(yield* Effect.promise(() => missing.json())).toMatchObject({ message: "DCP is not registered in the effective configuration" })
      expect(yield* Effect.promise(() => Bun.file(path.join(tmp.path, ".opencode/dcp.jsonc")).exists())).toBe(false)
      yield* Effect.promise(() => disposeAllInstances())
      const reloaded = yield* Effect.promise(() => Promise.resolve(app().request("/config/context-settings", { headers })))
      expect(reloaded.status).toBe(200)
      expect(yield* Effect.promise(() => reloaded.json())).toMatchObject({ compactSkills: true, compactSkillsOverride: true })
    }),
  )

  it.live(
    "registers and removes the RTK plugin through the project JSONC plugin array",
    Effect.gen(function* () {
      const tmp = yield* tmpdirEffect({ config: { formatter: false, lsp: false } })
      const headers = { "content-type": "application/json", "x-opencode-directory": tmp.path }
      const initial = yield* Effect.promise(() => Promise.resolve(app().request("/config/context-settings", { headers })))
      expect(initial.status).toBe(200)
      expect(yield* Effect.promise(() => initial.json())).toMatchObject({ rtk: false })
      const enable = yield* Effect.promise(() => Promise.resolve(app().request("/config/context-settings", {
        method: "PATCH", headers, body: JSON.stringify({ setting: "rtk", enabled: true }),
      })))
      expect(enable.status).toBe(200)
      expect(yield* Effect.promise(() => enable.json())).toMatchObject({ rtk: true })
      expect(yield* Effect.promise(() => Bun.file(path.join(tmp.path, ".opencode/opencode.jsonc")).json())).toEqual({
        plugin: ["./node_modules/opencode-rtk"],
      })
      const disable = yield* Effect.promise(() => Promise.resolve(app().request("/config/context-settings", {
        method: "PATCH", headers, body: JSON.stringify({ setting: "rtk", enabled: false }),
      })))
      expect(disable.status).toBe(200)
      expect(yield* Effect.promise(() => disable.json())).toMatchObject({ rtk: false })
      expect(yield* Effect.promise(() => Bun.file(path.join(tmp.path, ".opencode/opencode.jsonc")).json())).toEqual({
        plugin: [],
      })
    }),
  )

  it.live(
    "serves config update through the default server app",
    Effect.gen(function* () {
      const tmp = yield* tmpdirEffect({ config: { formatter: false, lsp: false } })
      const disposed = yield* waitDisposed(tmp.path).pipe(Effect.forkScoped({ startImmediately: true }))

      const response = yield* Effect.promise(() =>
        Promise.resolve(
          app().request("/config", {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              "x-opencode-directory": tmp.path,
            },
            body: JSON.stringify({ username: "patched-user", formatter: false, lsp: false }),
          }),
        ),
      )

      expect(response.status).toBe(200)
      expect(yield* Effect.promise(() => response.json())).toMatchObject({
        username: "patched-user",
        formatter: false,
        lsp: false,
      })
      yield* Fiber.join(disposed)
      expect(yield* Effect.promise(() => Bun.file(path.join(tmp.path, "config.json")).json())).toMatchObject({
        username: "patched-user",
        formatter: false,
        lsp: false,
      })
    }),
  )

  it.live(
    "serves config with active provider model status",
    Effect.gen(function* () {
      const tmp = yield* tmpdirEffect({
        config: {
          formatter: false,
          lsp: false,
          provider: {
            omniroute: {
              models: {
                "gpt-4o": {
                  status: "active",
                },
              },
            },
          },
        },
      })

      const response = yield* Effect.promise(() =>
        Promise.resolve(
          app().request("/config", {
            headers: {
              "x-opencode-directory": tmp.path,
            },
          }),
        ),
      )

      expect(response.status).toBe(200)
      expect(yield* Effect.promise(() => response.json())).toMatchObject({
        provider: {
          omniroute: {
            models: {
              "gpt-4o": {
                status: "active",
              },
            },
          },
        },
      })
    }),
  )
})
