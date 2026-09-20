export * as SkillGuidance from "./guidance"

import { makeLocationNode } from "../effect/app-node"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { AgentV2 } from "../agent"
import { Config } from "../config"
import { PermissionV2 } from "../permission"
import { SkillV2 } from "../skill"
import { SystemContext } from "../system-context/index"

const Summary = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
})
type Summary = typeof Summary.Type

const render = (skills: ReadonlyArray<Summary>) =>
  [
    "Skills provide specialized instructions and workflows for specific tasks.",
    "Use the skill tool to load a skill when a task matches its description.",
    ...(skills.length === 0
      ? ["No skills are currently available."]
      : [
          "<available_skills>",
          ...skills.flatMap((skill) => [
            "  <skill>",
            `    <name>${skill.name}</name>`,
            `    <description>${skill.description}</description>`,
            "  </skill>",
          ]),
          "</available_skills>",
        ]),
  ].join("\n")

const renderNames = (skills: ReadonlyArray<Summary>) =>
  [
    "The following skills are available. Use the skill tool to load a skill's full instructions by name before following them.",
    ...(skills.length === 0 ? ["No skills are currently available."] : skills.map((skill) => `- ${skill.name}`)),
  ].join("\n")

export interface Interface {
  readonly load: (agent: AgentV2.Selection) => Effect.Effect<SystemContext.SystemContext>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/SkillGuidance") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const skills = yield* SkillV2.Service
    const config = yield* Effect.serviceOption(Config.Service)

    const namesOnly = Effect.fnUntraced(function* () {
      if (Option.isNone(config)) return false
      const entries = yield* config.value.entries()
      return (
        entries
          .filter((entry): entry is Config.Document => entry.type === "document")
          .findLast((entry) => entry.info.experimental?.skillIndexNamesOnly !== undefined)?.info.experimental
          ?.skillIndexNamesOnly === true
      )
    })

    return Service.of({
      load: Effect.fn("SkillGuidance.load")(function* (selection) {
        const agent = selection.info
        if (!agent) return SystemContext.empty
        const permitted = SkillV2.available(yield* skills.list(), agent)
        if (permitted.length === 0 && PermissionV2.evaluate("skill", "*", agent.permissions).effect === "deny")
          return SystemContext.empty
        const available = permitted
          .flatMap((skill) =>
            skill.description === undefined ? [] : [{ name: skill.name, description: skill.description }],
          )
          .toSorted((a, b) => a.name.localeCompare(b.name))
        const compact = yield* namesOnly()
        return SystemContext.make({
          key: SystemContext.Key.make("core/skill-guidance"),
          codec: Schema.toCodecJson(
            Schema.Union([
              Schema.Array(Summary),
              Schema.Struct({ namesOnly: Schema.Literal(true), skills: Schema.Array(Summary) }),
            ]),
          ),
          load: Effect.succeed(compact ? { namesOnly: true as const, skills: available } : available),
          baseline: (current) => ("skills" in current ? renderNames(current.skills) : render(current)),
          update: (_previous, current) =>
            [
              "The available skills have changed. This list supersedes the previous available skills list.",
              "skills" in current ? renderNames(current.skills) : render(current),
            ].join("\n"),
          removed: () => "Skill guidance is no longer available. Do not use any previously listed skill.",
        })
      }),
    })
  }),
)

export const locationLayer = layer

export const node = makeLocationNode({ service: Service, layer, deps: [SkillV2.node, Config.node] })
