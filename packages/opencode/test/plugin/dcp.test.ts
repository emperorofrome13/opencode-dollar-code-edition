import { describe, expect } from "bun:test"
import { Effect } from "effect"
import path from "path"
import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Npm } from "@opencode-ai/core/npm"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { Account } from "../../src/account/account"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { ConfigParse } from "../../src/config/parse"
import { ConfigPlugin } from "../../src/config/plugin"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Plugin } from "../../src/plugin"
import { AccountTest } from "../fake/account"
import { AuthTest } from "../fake/auth"
import { NpmTest } from "../fake/npm"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Plugin.node, Config.node, CrossSpawnSpawner.node]), [
    [Auth.node, AuthTest.empty],
    [Account.node, AccountTest.empty],
    [Npm.node, NpmTest.noop],
    [RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true })],
  ]),
)
const directory = path.resolve(import.meta.dir, "../../../../.opencode")
const source = path.join(directory, "opencode.jsonc")

for (const enabled of [true, false]) {
  describe(`project DCP enabled=${enabled}`, () => {
    it.instance("loads the pinned package through the real legacy service and executes hooks", () =>
      Effect.gen(function* () {
        const instance = yield* TestInstance
        const config = ConfigParse.schema(
          ConfigV1.Info,
          ConfigParse.jsonc(yield* Effect.promise(() => Bun.file(source).text()), source),
          source,
        )
        const spec = config.plugin?.find((item) => ConfigPlugin.pluginSpecifier(item).includes("opencode-dcp"))
        expect(spec).toBe("./node_modules/@tarquinen/opencode-dcp")
        if (!spec) throw new Error("Project DCP registration is missing")
        const resolved = yield* Effect.promise(() => ConfigPlugin.resolvePluginSpec(spec, source))
        const manifest = yield* Effect.promise(() =>
          Bun.file(path.join(directory, "node_modules/@tarquinen/opencode-dcp/package.json")).json(),
        )
        expect(manifest.version).toBe("3.1.15")
        const dcp = yield* Effect.promise(() => Bun.file(path.join(directory, "dcp.jsonc")).json())
        expect(dcp.autoUpdate).toBe(false)
        expect(dcp.compress.permission).toBe("ask")
        expect(config.experimental?.skill_index_names_only).toBe(true)
        yield* Effect.promise(() =>
          Bun.write(path.join(instance.directory, ".opencode/dcp.jsonc"), JSON.stringify({ ...dcp, enabled })),
        )
        yield* Effect.promise(() =>
          Bun.write(
            path.join(instance.directory, "opencode.json"),
            JSON.stringify({ plugin: [resolved, resolved], experimental: config.experimental }),
          ),
        )
        const plugin = yield* Plugin.Service
        const hooks = yield* plugin.list()
        expect(hooks).toHaveLength(1)
        expect(Boolean(hooks[0].tool?.compress)).toBe(enabled)
        const cfg = yield* Config.Service
        const loaded = yield* cfg.get()
        expect(loaded.plugin_origins).toHaveLength(1)
        expect(Boolean(loaded.command?.["dcp-compress"])).toBe(enabled)
        const output = { system: ["Project instructions"] }
        yield* plugin.trigger(
          "experimental.chat.system.transform",
          { model: { providerID: ProviderV2.ID.anthropic, modelID: ModelV2.ID.make("test") } },
          output,
        )
        expect(output.system.join("\n").includes("compress")).toBe(enabled)
        const text = { text: "before<dcp-test>internal metadata</dcp-test>after" }
        yield* plugin.trigger(
          "experimental.text.complete",
          { sessionID: "test", messageID: "test", partID: "test" },
          text,
        )
        expect(text.text).toBe(enabled ? "beforeafter" : "before<dcp-test>internal metadata</dcp-test>after")
        const messages = { messages: [] }
        yield* plugin.trigger("experimental.chat.messages.transform", {}, messages)
        expect(messages.messages).toEqual([])
        const internal = { system: ["You are a title generator"] }
        yield* plugin.trigger(
          "experimental.chat.system.transform",
          { model: { providerID: ProviderV2.ID.anthropic, modelID: ModelV2.ID.make("test") } },
          internal,
        )
        expect(internal.system).toEqual(["You are a title generator"])
      }),
    )
  })
}
