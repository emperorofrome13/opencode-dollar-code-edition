# OpenCode Fork — agent instructions (not upstream opencode's file)

- Default branch is `dev`; local `main` may not exist, diff against `dev`/`origin/dev`.
- Legacy JS SDK: `./packages/sdk/js/script/build.ts`. After Protocol/Server `HttpApi` changes: `bun run generate` from `packages/client`. Never edit `src/generated` or `src/generated-effect`.
- Dependency direction: Schema → Core/Protocol → Server. Client may use Schema/Protocol, never Core/Server.
- Tests and typecheck run from package dirs (`packages/opencode`, `packages/core`): `bun test`, `bun typecheck`. Never from repo root, never bare `tsc`.
- Effect: `Effect.gen` composition, `Effect.fn("Domain.method")` for traced effects. Flat top-level exports with self-reexport (`export * as Foo from "./foo"`); no namespaces, no import aliases, no star imports.
- Style: `const` over `let`, early returns over `else`, type inference over annotations, `Bun.file()` over `fs`, no `any`, no `try/catch` where avoidable. Comment only non-obvious constraints.
- V2 core: durable prompt admission stays separate from model execution; execution is process-local per Session; keep `SessionRunner`, model resolution, tools, and permissions Location-scoped; one `llm.stream(request)` per provider turn; keep Context Epoch persistence Session-owned.
- This fork: local-first token diet. Prefer deleting prose over adding it; every per-turn token must earn its place.
