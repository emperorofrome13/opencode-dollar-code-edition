import { describe, expect, test } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Layer } from "effect"
import type { Agent } from "../../src/agent/agent"
import { NamedError } from "@opencode-ai/core/util/error"
import { Skill } from "../../src/skill"
import { Permission } from "../../src/permission"
import type { Provider } from "../../src/provider/provider"
import { SystemPrompt } from "../../src/session/system"
import PROMPT_DEFAULT from "../../src/session/prompt/default.txt"
import { MCP } from "../../src/mcp"
import { testEffect } from "../lib/effect"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { testInstanceStoreLayer } from "../fixture/fixture"
import path from "path"
import { jsonSchema } from "ai"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { SessionID, MessageID } from "../../src/session/schema"
import { LLMRequestPrep } from "../../src/session/llm/request"

const model: Provider.Model = {
  id: ModelV2.ID.make("gpt-5"),
  providerID: ProviderV2.ID.make("openai"),
  api: { id: "gpt-5", url: "https://api.openai.com/v1", npm: "@ai-sdk/openai" },
  name: "GPT-5",
  capabilities: {
    temperature: false,
    reasoning: true,
    attachment: false,
    toolcall: true,
    input: { text: true, audio: false, image: false, video: false, pdf: false },
    output: { text: true, audio: false, image: false, video: false, pdf: false },
    interleaved: false,
  },
  cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
  limit: { context: 128000, output: 32000 },
  status: "active",
  options: {},
  headers: {},
  release_date: "2026-01-01",
}

const preparation = testEffect(RuntimeFlags.layer())

const skills: Skill.Info[] = [
  {
    name: "zeta-skill",
    description: "Zeta skill.",
    location: "/tmp/zeta-skill/SKILL.md",
    content: "# zeta-skill",
  },
  {
    name: "alpha-skill",
    description: "Alpha skill.",
    location: "/tmp/alpha-skill/SKILL.md",
    content: "# alpha-skill",
  },
  {
    name: "middle-skill",
    description: "Middle skill.",
    location: "/tmp/middle-skill/SKILL.md",
    content: "# middle-skill",
  },
  {
    name: "manual-skill",
    location: "/tmp/manual-skill/SKILL.md",
    content: "# manual-skill",
  },
]

const build: Agent.Info = {
  name: "build",
  mode: "primary",
  permission: Permission.fromConfig({ "*": "allow" }),
  options: {},
}

const it = testEffect(
  LayerNode.compile(SystemPrompt.node, [
    [Config.node, Layer.mock(Config.Service, { get: () => Effect.succeed({}) })],
    [
      MCP.node,
      Layer.mock(MCP.Service, {
        instructions: () =>
          Effect.succeed([
            {
              name: "guide-server",
              instructions: "Use lookup before mutate.",
              tools: [],
            },
            {
              name: "tool-server",
              instructions: "Prefer search before update.",
              tools: ["tool-server_search", "tool-server_update"],
            },
          ]),
      }),
    ],
    [
      Skill.node,
      Layer.succeed(
        Skill.Service,
        Skill.Service.of({
          get: (name) => Effect.succeed(skills.find((skill) => skill.name === name)),
          require: (name) => {
            const info = skills.find((skill) => skill.name === name)
            if (info) return Effect.succeed(info)
            return Effect.fail(new Skill.NotFoundError({ name, available: skills.map((skill) => skill.name) }))
          },
          all: () => Effect.succeed(skills),
          dirs: () => Effect.succeed([]),
          available: () => Effect.succeed(skills),
        }),
      ),
    ],
  ]),
)

const integration = testEffect(
  Layer.mergeAll(
    LayerNode.compile(SystemPrompt.node, [
      [MCP.node, Layer.mock(MCP.Service, { instructions: () => Effect.succeed([]) })],
      [RuntimeFlags.node, RuntimeFlags.layer({ disableExternalSkills: true })],
    ]),
    LayerNode.compile(CrossSpawnSpawner.node),
    testInstanceStoreLayer,
  ),
)

describe("session.system", () => {
  for (const oauth of [false, true]) {
    for (const custom of [undefined, "", "Custom agent instructions."]) {
      for (const transform of ["none", "append", "replace"]) {
        preparation.effect(
          `request preserves custom=${JSON.stringify(custom)} oauth=${oauth} transform=${transform}`,
          () =>
            Effect.gen(function* () {
              const flags = yield* RuntimeFlags.Service
              const sessionID = SessionID.make("session-system-test")
              const context = ["Project instructions.", "Available skills.", "Environment details."]
              const header = [custom || PROMPT_DEFAULT, ...context, "User system instructions."].join("\n")
              const result = yield* LLMRequestPrep.prepare({
                sessionID,
                model,
                agent: { ...build, prompt: custom },
                user: {
                  id: MessageID.make("msg_system-test"),
                  sessionID,
                  role: "user",
                  time: { created: 0 },
                  agent: build.name,
                  model: { providerID: model.providerID, modelID: model.id },
                  system: "User system instructions.",
                },
                system: context,
                messages: [{ role: "user", content: "Hello" }],
                tools: {
                  write: { inputSchema: jsonSchema({ type: "object", properties: {} }) },
                  read: { inputSchema: jsonSchema({ type: "object", properties: {} }) },
                },
                permission: Permission.fromConfig({ edit: "deny" }),
                provider: {
                  id: model.providerID,
                  name: "OpenAI",
                  source: "config",
                  env: [],
                  options: {},
                  models: {},
                },
                auth: oauth ? { type: "oauth", refresh: "test", access: "test", expires: 0 } : undefined,
                plugin: {
                  trigger: (name, _input, output) =>
                    Effect.sync(() => {
                      if (
                        name === "experimental.chat.system.transform" &&
                        typeof output === "object" &&
                        output !== null &&
                        "system" in output &&
                        Array.isArray(output.system)
                      ) {
                        expect(output.system).toEqual([header])
                        if (transform === "append") output.system.push("Plugin one.", "Plugin two.")
                        if (transform === "replace") output.system.splice(0, 1, "Plugin replacement.")
                      }
                      return output
                    }),
                  list: () => Effect.succeed([]),
                  init: () => Effect.void,
                },
                flags,
                isWorkflow: false,
              })
              const expected =
                transform === "replace"
                  ? ["Plugin replacement."]
                  : transform === "append"
                    ? [header, "Plugin one.\nPlugin two."]
                    : [header]
              expect(result.system).toEqual(expected)
              expect(Object.keys(result.tools)).toEqual(["read"])
              expect(result.params.options.instructions).toBe(oauth ? expected.join("\n") : undefined)
              expect(result.messages).toEqual([
                ...(oauth ? [] : expected.map((content) => ({ role: "system" as const, content }))),
                { role: "user", content: "Hello" },
              ])
              if (custom) expect(result.system.join("\n")).not.toContain(PROMPT_DEFAULT)
            }),
        )
      }
    }
  }

  for (const enabled of [true, false, undefined]) {
    integration.instance(
      `skill index with flag ${enabled ?? "absent"} preserves permissions and deterministic output`,
      () =>
        Effect.gen(function* () {
          const prompt = yield* SystemPrompt.Service
          const agent = {
            ...build,
            permission: Permission.fromConfig({
              skill: { "*": "allow", "customize-opencode": "deny", "middle-*": "deny", "alpha-skill": "ask" },
            }),
          }
          const first = yield* prompt.skills(agent)
          expect(first).toBe(yield* prompt.skills(agent))
          expect(first).not.toContain("middle-skill")
          expect(first).not.toContain("customize-opencode")
          expect(first).not.toContain("manual-skill")
          expect(first).not.toContain("# alpha-skill")
          expect(first).not.toContain("# zeta-skill")

          if (enabled) {
            expect(first).toBe(
              [
                "The following skills are available. Use the skill tool to load a skill's full instructions by name before following them.",
                "- alpha-skill",
                "- zeta-skill",
              ].join("\n"),
            )
            for (const skill of skills) {
              if (skill.description) expect(first).not.toContain(skill.description)
            }
            expect(first).not.toContain("SKILL.md")
            expect(first).not.toContain("<description>")
            expect(first).not.toContain("<location>")
          }
          if (!enabled) {
            expect(first).toStartWith(
              "Skills provide specialized instructions and workflows for specific tasks.\nUse the skill tool to load a skill when a task matches its description.\n<available_skills>",
            )
            expect(first).toContain("<description>Alpha skill.</description>")
            expect(first).toContain("<description>Zeta skill.</description>")
            expect(first).toContain("<location>")
            expect(first).toContain("SKILL.md</location>")
            expect(first!.indexOf("<name>alpha-skill</name>")).toBeLessThan(first!.indexOf("<name>zeta-skill</name>"))
          }

          expect(
            yield* prompt.skills({ ...build, permission: Permission.fromConfig({ skill: "deny" }) }),
          ).toBeUndefined()
          const empty = yield* prompt.skills({
            ...build,
            permission: Permission.fromConfig({ skill: { "*": "deny", "manual-skill": "allow" } }),
          })
          expect(empty).toEndWith("No skills are currently available.")
          expect(empty).not.toContain("manual-skill")
        }),
      {
        config: {
          skills: { paths: ["skills"] },
          ...(enabled === undefined ? {} : { experimental: { skill_index_names_only: enabled } }),
        },
        init: (directory) =>
          Effect.promise(() =>
            Promise.all(
              skills.map((skill) =>
                Bun.write(
                  path.join(directory, "skills", skill.name, "SKILL.md"),
                  [
                    "---",
                    `name: ${skill.name}`,
                    ...(skill.description === undefined ? [] : [`description: ${skill.description}`]),
                    "---",
                    skill.content,
                  ].join("\n"),
                ),
              ),
            ),
          ).pipe(Effect.asVoid),
      },
    )
  }

  test.each([
    ["meta", "meta/muse-spark-preview"],
    ["meta", "muse-spark-1.1"],
    ["meta", "muse-spark-1.2"],
    ["meta", "meta/muse-glimmer"],
    ["meta", "meta/muse-glimmer-30b"],
    ["meta", "muse-glimmer-30b"],
    ["openai", "gpt-4o"],
    ["openai", "o1"],
    ["openai", "o3"],
    ["openai", "gpt-5"],
    ["openai", "gpt-6"],
    ["openai", "gpt-5-codex"],
    ["google", "gemini-2.5-pro"],
    ["anthropic", "claude-sonnet-4"],
    ["openrouter", "arcee-ai/Trinity"],
    ["openrouter", "moonshotai/Kimi-K2"],
    ["kimi-for-coding", "k3"],
    ["moonshotai", "k3"],
    ["moonshotai-cn", "k3"],
    ["local", "unknown-model"],
    ["local", ""],
  ])("uses the compact default for %s/%s", (providerID, id) => {
    const sample = { ...model, providerID: ProviderV2.ID.make(providerID), api: { ...model.api, id } }
    const prompt = SystemPrompt.provider(sample)
    expect(prompt).toEqual([PROMPT_DEFAULT])
    expect(prompt[0].length).toBeGreaterThan(0)
    expect(prompt[0].length).toBeLessThan(1500)
    expect(prompt[0]).toContain("Never expose, log, or commit secrets.")
    expect(prompt[0]).toContain("explicit user permission before destructive operations, commits, or pushes")
    prompt.push("plugin addition")
    expect(SystemPrompt.provider(sample)).toEqual([PROMPT_DEFAULT])
  })

  it.effect("skills output is sorted by name and stable across calls", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const first = yield* prompt.skills(build)
      const second = yield* prompt.skills(build)
      const output = first ?? (yield* Effect.fail(new NamedError.Unknown({ message: "missing skills output" })))

      expect(first).toBe(second)

      const alpha = output.indexOf("<name>alpha-skill</name>")
      const middle = output.indexOf("<name>middle-skill</name>")
      const zeta = output.indexOf("<name>zeta-skill</name>")

      expect(alpha).toBeGreaterThan(-1)
      expect(middle).toBeGreaterThan(alpha)
      expect(zeta).toBeGreaterThan(middle)
      expect(output).not.toContain("manual-skill")
    }),
  )

  it.effect("MCP output includes connected server instructions", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const output = yield* prompt.mcp(build)

      expect(output).toBe(
        [
          "<mcp_instructions>",
          '  <server name="guide-server">',
          "    Use lookup before mutate.",
          "  </server>",
          '  <server name="tool-server">',
          "    Prefer search before update.",
          "  </server>",
          "</mcp_instructions>",
        ].join("\n"),
      )
    }),
  )

  it.effect("MCP output omits servers when all advertised tools are denied", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const output = yield* prompt.mcp(build, Permission.fromConfig({ "tool-server_*": "deny" }))

      expect(output).toBe(
        [
          "<mcp_instructions>",
          '  <server name="guide-server">',
          "    Use lookup before mutate.",
          "  </server>",
          "</mcp_instructions>",
        ].join("\n"),
      )
    }),
  )
})
