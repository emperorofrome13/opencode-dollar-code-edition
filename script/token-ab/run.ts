// Token A/B harness: spawn the opencode CLI from two checkouts against a mock
// LLM and capture the exact request bodies each sends, so the fork's prompt /
// tool / truncation savings can be measured instead of estimated.
//
// It reuses opencode's own test affordances (see packages/opencode/test/lib/
// cli-process.ts): OPENCODE_CONFIG_CONTENT injects an inline provider config,
// OPENCODE_TEST_HOME pins the home dir, and OPENCODE_PURE / DISABLE_* stop
// plugin discovery, model fetches and autoupdate. Nothing touches the real
// ~/.local/share/opencode.
//
// Env:
//   AB_UPSTREAM_CLI  path to the upstream checkout's packages/opencode/src/index.ts
//   AB_FORK_CLI      path to the fork checkout's .../index.ts (default: this repo)
//   AB_OUT           capture output dir (default: script/token-ab/out)
//   AB_MSG           the single user message (default: "hello")
//   AB_TAG           suffix for capture filenames
//   AB_TOOL_FILE     tool spec to force (default: tool.json)
//   AB_CONTEXT_LIMIT model context window advertised to opencode (default: 100000)
//   MOCK_TOOL_TURNS  how many turns the mock keeps asking for the tool (default: 1)
//   MOCK_TOOL        JSON {name,args}; overrides AB_TOOL_FILE
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const HERE = import.meta.dir
const REPO = resolve(HERE, "../..")
const MOCK = join(HERE, "mock-llm.ts")
const OUT = process.env.AB_OUT ?? join(HERE, "out")
const MSG = process.env.AB_MSG ?? "hello"
const TAG = process.env.AB_TAG ?? ""
const TOOL_FILE = join(HERE, process.env.AB_TOOL_FILE ?? "tool.json")
const TOOL_SPEC = process.env.MOCK_TOOL ?? (existsSync(TOOL_FILE) ? readFileSync(TOOL_FILE, "utf8").trim() : "")
const TOOL_TURNS = process.env.MOCK_TOOL_TURNS ?? "1"
const CONTEXT_LIMIT = Number(process.env.AB_CONTEXT_LIMIT ?? 100_000)
const UPSTREAM_CLI = process.env.AB_UPSTREAM_CLI

if (!UPSTREAM_CLI) throw new Error("set AB_UPSTREAM_CLI to the upstream checkout's packages/opencode/src/index.ts")

function testProviderConfig(llmUrl: string) {
  return {
    formatter: false,
    lsp: false,
    provider: {
      test: {
        name: "Test",
        id: "test",
        env: [],
        npm: "@ai-sdk/openai-compatible",
        models: {
          "test-model": {
            id: "test-model",
            name: "Test Model",
            attachment: false,
            reasoning: false,
            temperature: false,
            tool_call: true,
            release_date: "2025-01-01",
            limit: { context: CONTEXT_LIMIT, output: 10_000 },
            cost: { input: 0, output: 0 },
            options: {},
          },
        },
        options: { apiKey: "test-key", baseURL: llmUrl },
      },
    },
  }
}

function isolatedEnv(home: string, configJson: string): Record<string, string> {
  return {
    OPENCODE_TEST_HOME: home,
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: join(home, ".local/share"),
    XDG_STATE_HOME: join(home, ".local/state"),
    XDG_CACHE_HOME: join(home, ".cache"),
    OPENCODE_CONFIG_CONTENT: configJson,
    OPENCODE_DISABLE_PROJECT_CONFIG: "1",
    OPENCODE_PURE: "1",
    OPENCODE_DISABLE_AUTOUPDATE: "1",
    OPENCODE_DISABLE_AUTOCOMPACT: "1",
    OPENCODE_DISABLE_MODELS_FETCH: "1",
    OPENCODE_AUTH_CONTENT: "{}",
  }
}

const targets = [
  { name: "upstream", cli: UPSTREAM_CLI, port: 4631, capture: join(OUT, `cap-upstream${TAG}.jsonl`) },
  {
    name: "fork",
    cli: process.env.AB_FORK_CLI ?? join(REPO, "packages", "opencode", "src", "index.ts"),
    port: 4632,
    capture: join(OUT, `cap-fork${TAG}.jsonl`),
  },
]

async function waitReady(port: number) {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/v1/models`)
      if (r.ok) return
    } catch {}
    await Bun.sleep(100)
  }
  throw new Error(`mock server on ${port} never became ready`)
}

for (const t of targets) {
  const srv = Bun.spawn(["bun", "run", MOCK], {
    env: { ...process.env, MOCK_PORT: String(t.port), MOCK_CAPTURE: t.capture, MOCK_TOOL_TURNS: TOOL_TURNS, ...(TOOL_SPEC ? { MOCK_TOOL: TOOL_SPEC } : {}) },
    stdout: "pipe",
    stderr: "pipe",
  })
  await waitReady(t.port)

  const home = mkdtempSync(join(tmpdir(), `ocab-${t.name}-`))
  const config = JSON.stringify(testProviderConfig(`http://127.0.0.1:${t.port}/v1`))
  const env = isolatedEnv(home, config)

  const started = Date.now()
  const cli = Bun.spawn(["bun", "run", t.cli, "run", "--model", "test/test-model", MSG], {
    cwd: home,
    env: { ...process.env, ...env },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const out = await new Response(cli.stdout).text()
  const err = await new Response(cli.stderr).text()
  const code = await cli.exited
  console.log(`[${t.name}] exit=${code} ms=${Date.now() - started} stdout=${out.length}b stderr=${err.length}b`)
  if (code !== 0) console.log(`[${t.name}] stderr tail:\n${err.slice(-2000)}`)
  srv.kill()
}

console.log("DONE")
