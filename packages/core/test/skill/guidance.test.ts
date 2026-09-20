import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { AgentV2 } from "@opencode-ai/core/agent"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SkillV2 } from "@opencode-ai/core/skill"
import { SystemContext } from "@opencode-ai/core/system-context"
import { SkillGuidance } from "@opencode-ai/core/skill/guidance"
import { Config } from "@opencode-ai/core/config"
import { ConfigMigrateV1 } from "@opencode-ai/core/v1/config/migrate"
import { it } from "../lib/effect"

const build = AgentV2.ID.make("build")
const effect = SkillV2.Info.make({
  name: "effect",
  description: "Build applications with Effect",
  location: AbsolutePath.make(path.resolve("/skills/effect/SKILL.md")),
  content: "Effect guidance",
})
const hidden = SkillV2.Info.make({
  name: "hidden",
  location: AbsolutePath.make(path.resolve("/skills/hidden/SKILL.md")),
  content: "Undescribed guidance",
})
const denied = SkillV2.Info.make({
  name: "denied",
  description: "Must not be advertised",
  location: AbsolutePath.make(path.resolve("/skills/denied/SKILL.md")),
  content: "Denied guidance",
})

const document = (info: unknown) => Schema.decodeUnknownSync(Config.Document)({ type: "document", info })

const layer = (list: () => SkillV2.Info[], entries: () => Config.Entry[] = () => []) =>
  AppNodeBuilder.build(SkillGuidance.node, [
    [SkillV2.node, Layer.mock(SkillV2.Service, { list: () => Effect.succeed(list()) })],
    [Config.node, Layer.succeed(Config.Service, { entries: () => Effect.succeed(entries()) })],
  ])

describe("SkillGuidance", () => {
  it.effect("renders described agent skills and reconciles the complete available list", () => {
    const agent = AgentV2.Info.make({
      ...AgentV2.Info.empty(build),
      permissions: [{ action: "skill", resource: "denied", effect: "deny" }],
    })
    let skills = [hidden, denied, effect]
    return Effect.gen(function* () {
      const guidance = yield* SkillGuidance.Service
      const initialized = yield* guidance
        .load({ id: agent.id, info: agent })
        .pipe(Effect.flatMap(SystemContext.initialize))

      expect(initialized.baseline).toBe(
        [
          "Skills provide specialized instructions and workflows for specific tasks.",
          "Use the skill tool to load a skill when a task matches its description.",
          "<available_skills>",
          "  <skill>",
          "    <name>effect</name>",
          "    <description>Build applications with Effect</description>",
          "  </skill>",
          "</available_skills>",
        ].join("\n"),
      )

      skills = []
      expect(
        yield* guidance
          .load({ id: agent.id, info: agent })
          .pipe(Effect.flatMap((context) => SystemContext.reconcile(context, initialized.snapshot))),
      ).toMatchObject({
        _tag: "Updated",
        text: expect.stringContaining("No skills are currently available."),
      })
    }).pipe(Effect.provide(layer(() => skills)))
  })

  it.effect("renders names-only index when experimental.skillIndexNamesOnly is enabled", () => {
    const agent = AgentV2.Info.make({ ...AgentV2.Info.empty(build) })
    return Effect.gen(function* () {
      const guidance = yield* SkillGuidance.Service
      const initialized = yield* guidance
        .load({ id: agent.id, info: agent })
        .pipe(Effect.flatMap(SystemContext.initialize))

      expect(initialized.baseline).toBe(
        [
          "The following skills are available. Use the skill tool to load a skill's full instructions by name before following them.",
          "- effect",
        ].join("\n"),
      )
    }).pipe(
      Effect.provide(
        layer(
          () => [hidden, effect],
          () => [document({ experimental: { skillIndexNamesOnly: true } })],
        ),
      ),
    )
  })

  for (const enabled of [true, false, undefined]) {
    it.effect(`resolves names-only ${enabled} across documents without dropping explicit false`, () => {
      const agent = AgentV2.Info.empty(build)
      return Effect.gen(function* () {
        const guidance = yield* SkillGuidance.Service
        const initialized = yield* guidance
          .load({ id: agent.id, info: agent })
          .pipe(Effect.flatMap(SystemContext.initialize))
        expect(initialized.baseline.includes("- effect")).toBe(enabled !== false)
        expect(initialized.baseline.includes("<description>")).toBe(enabled === false)
      }).pipe(
        Effect.provide(
          layer(
            () => [effect],
            () => [
              document({ experimental: { skillIndexNamesOnly: enabled === undefined ? true : !enabled } }),
              new Config.Directory({ type: "directory", path: effect.location }),
              document(ConfigMigrateV1.migrate({ experimental: { skill_index_names_only: enabled } })),
              document({ experimental: { policies: [] } }),
              document({}),
            ],
          ),
        ),
      )
    })
  }

  for (const enabled of [false, undefined]) {
    it.effect(`preserves legacy array snapshots with names-only ${enabled}`, () => {
      const agent = AgentV2.Info.empty(build)
      return Effect.gen(function* () {
        const guidance = yield* SkillGuidance.Service
        const context = yield* guidance.load({ id: agent.id, info: agent })
        const initialized = yield* SystemContext.initialize(context)
        expect(initialized.baseline).toContain("<description>Build applications with Effect</description>")
        expect(initialized.snapshot["core/skill-guidance"].value).toEqual([
          { name: effect.name, description: effect.description! },
        ])
        expect(
          yield* SystemContext.reconcile(context, {
            "core/skill-guidance": { value: [{ name: effect.name, description: effect.description! }] },
          }),
        ).toEqual({ _tag: "Unchanged" })
      }).pipe(
        Effect.provide(
          layer(
            () => [effect],
            () => [document({ experimental: { skillIndexNamesOnly: enabled } })],
          ),
        ),
      )
    })
  }

  it.effect("reconciles both mode toggles and compact list updates without replacing legacy snapshots", () => {
    const agent = AgentV2.Info.empty(build)
    let enabled = true
    let skills = [effect]
    return Effect.gen(function* () {
      const guidance = yield* SkillGuidance.Service
      const compact = yield* guidance.load({ id: agent.id, info: agent })
      const switched = yield* SystemContext.reconcile(compact, {
        "core/skill-guidance": { value: [{ name: effect.name, description: effect.description! }] },
      })
      expect(switched._tag).toBe("Updated")
      if (switched._tag !== "Updated") return
      expect(switched.text).toContain("This list supersedes the previous available skills list.")
      expect(switched.text).toContain("- effect")
      expect(switched.text).not.toContain("<description>")
      expect(yield* SystemContext.reconcile(compact, switched.snapshot)).toEqual({ _tag: "Unchanged" })

      enabled = false
      const full = yield* guidance.load({ id: agent.id, info: agent })
      const restored = yield* SystemContext.reconcile(full, switched.snapshot)
      expect(restored._tag).toBe("Updated")
      if (restored._tag !== "Updated") return
      expect(restored.text).toContain("<description>Build applications with Effect</description>")
      expect(yield* SystemContext.reconcile(full, restored.snapshot)).toEqual({ _tag: "Unchanged" })

      enabled = true
      const toggled = yield* guidance
        .load({ id: agent.id, info: agent })
        .pipe(Effect.flatMap((context) => SystemContext.reconcile(context, restored.snapshot)))
      expect(toggled._tag).toBe("Updated")
      if (toggled._tag !== "Updated") return
      skills = []
      const updated = yield* guidance
        .load({ id: agent.id, info: agent })
        .pipe(Effect.flatMap((context) => SystemContext.reconcile(context, toggled.snapshot)))
      expect(updated).toMatchObject({
        _tag: "Updated",
        text:
          "The available skills have changed. This list supersedes the previous available skills list.\n" +
          "The following skills are available. Use the skill tool to load a skill's full instructions by name before following them.\n" +
          "No skills are currently available.",
      })
    }).pipe(
      Effect.provide(
        layer(
          () => skills,
          () => [document({ experimental: { skillIndexNamesOnly: enabled } })],
        ),
      ),
    )
  })

  for (const allowed of [true, false]) {
    it.effect(`honors compact skill permissions with specific allow ${allowed}`, () => {
      const agent = AgentV2.Info.make({
        ...AgentV2.Info.empty(build),
        permissions: [
          { action: "skill", resource: "*", effect: "deny" },
          ...(allowed ? [{ action: "skill", resource: "effect", effect: "allow" as const }] : []),
        ],
      })
      return Effect.gen(function* () {
        const guidance = yield* SkillGuidance.Service
        const initialized = yield* guidance
          .load({ id: agent.id, info: agent })
          .pipe(Effect.flatMap(SystemContext.initialize))
        expect(initialized.baseline.includes("- effect")).toBe(allowed)
        expect(initialized.baseline).not.toContain("denied")
        expect(initialized.baseline).not.toContain("hidden")
        expect(initialized.baseline).not.toContain(effect.description!)
        expect(initialized.baseline).not.toContain(effect.location)
        expect(initialized.baseline).not.toContain(effect.content)
        if (!allowed) expect(initialized).toEqual({ baseline: "", snapshot: {} })
      }).pipe(
        Effect.provide(
          layer(
            () => [hidden, denied, effect],
            () => [document({ experimental: { skillIndexNamesOnly: true } })],
          ),
        ),
      )
    })
  }

  it.effect("omits guidance when the selected agent denies all skills", () => {
    const agent = AgentV2.Info.make({
      ...AgentV2.Info.empty(build),
      permissions: [{ action: "skill", resource: "*", effect: "deny" }],
    })
    return Effect.gen(function* () {
      const guidance = yield* SkillGuidance.Service
      expect(
        yield* guidance.load({ id: agent.id, info: agent }).pipe(Effect.flatMap(SystemContext.initialize)),
      ).toEqual({
        baseline: "",
        snapshot: {},
      })
    }).pipe(Effect.provide(layer(() => [effect])))
  })

  it.effect("omits guidance when a resource-specific denial follows the global denial", () => {
    const agent = AgentV2.Info.make({
      ...AgentV2.Info.empty(build),
      permissions: [
        { action: "skill", resource: "*", effect: "deny" },
        { action: "skill", resource: "hidden", effect: "deny" },
      ],
    })
    return Effect.gen(function* () {
      const guidance = yield* SkillGuidance.Service
      expect(
        yield* guidance.load({ id: agent.id, info: agent }).pipe(Effect.flatMap(SystemContext.initialize)),
      ).toEqual({
        baseline: "",
        snapshot: {},
      })
    }).pipe(Effect.provide(layer(() => [effect])))
  })

  it.effect("retains specifically allowed skills after a global denial", () => {
    const agent = AgentV2.Info.make({
      ...AgentV2.Info.empty(build),
      permissions: [
        { action: "skill", resource: "*", effect: "deny" },
        { action: "skill", resource: "effect", effect: "allow" },
      ],
    })
    return Effect.gen(function* () {
      const guidance = yield* SkillGuidance.Service
      expect(
        (yield* guidance.load({ id: agent.id, info: agent }).pipe(Effect.flatMap(SystemContext.initialize))).baseline,
      ).toContain("<name>effect</name>")
    }).pipe(Effect.provide(layer(() => [effect])))
  })

  it.effect("omits guidance when a specifically allowed skill is denied again", () => {
    const agent = AgentV2.Info.make({
      ...AgentV2.Info.empty(build),
      permissions: [
        { action: "skill", resource: "*", effect: "deny" },
        { action: "skill", resource: "effect", effect: "allow" },
        { action: "skill", resource: "effect", effect: "deny" },
      ],
    })
    return Effect.gen(function* () {
      const guidance = yield* SkillGuidance.Service
      expect(
        yield* guidance.load({ id: agent.id, info: agent }).pipe(Effect.flatMap(SystemContext.initialize)),
      ).toEqual({
        baseline: "",
        snapshot: {},
      })
    }).pipe(Effect.provide(layer(() => [effect])))
  })
})
