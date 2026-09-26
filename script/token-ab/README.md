# Token A/B harness

Measures what the fork actually changes in the bytes sent to the model, by
running the real opencode CLI from two checkouts against a local mock LLM and
tokenizing the captured request bodies. No provider account or network needed.

It uses opencode's own test affordances (`packages/opencode/test/lib/cli-process.ts`):
`OPENCODE_CONFIG_CONTENT` injects an inline `@ai-sdk/openai-compatible` provider,
`OPENCODE_TEST_HOME` pins the home dir, and `OPENCODE_PURE` /
`OPENCODE_DISABLE_*` stop plugin discovery, model fetches and autoupdate. The
real `~/.local/share/opencode` is never touched.

## What it measures

1. **First request** — the system prompt and the tool definitions, which are
   rebuilt on every turn.
2. **Tool output truncation** — `tool.json` makes the mock request one `bash`
   call whose output is ~1.2 MB, so the follow-up request carries the truncated
   tool result the model would actually see.

## Run it

```powershell
# 1. Check out the upstream base the fork was built on (one-time).
$base = "C:\tmp\opencode-upstream"
git worktree add --detach $base "cbc4bb571f^"
bun install --frozen-lockfile   # run with cwd = $base

# 2. Capture both sides.
$env:AB_UPSTREAM_CLI = "$base\packages\opencode\src\index.ts"
bun run script/token-ab/run.ts

# 3. Tokenize and diff.
pip install tiktoken
python script/token-ab/analyze.py
```

Captures land in `script/token-ab/out/`. Set `AB_TAG` to keep multiple runs.
Delete `tool.json` to skip the tool call and measure only the first request.

## Recorded results

Run on 2026-09-25, Windows, `tiktoken` `o200k_base`, model `test/test-model`
(which selects upstream's generic `default.txt`). Upstream = `cbc4bb571f^`,
fork = `cbc4bb571f`.

### First request

| item | upstream | fork | delta |
|---|---:|---:|---:|
| raw request body | 8,968 | 6,002 | **−2,966** |
| messages JSON | 3,950 | 2,204 | −1,746 |
| system prompt | 3,614 | 2,032 | **−1,582** |
| tool definitions | 5,343 | 4,123 | **−1,220** |

Per-tool: `bash` 1,478 → 811 (−667), `task` 881 → 668 (−213),
`todowrite` 698 → 496 (−202), `webfetch` 338 → 200 (−138). The other six tools
are unchanged.

### Tool output truncation

One `bash` call emitting ~1.2 MB:

| item | upstream | fork | delta |
|---|---:|---:|---:|
| tool result sent to model | 51,347 chars / 7,609 tok | 16,512 chars / 2,473 tok | **−5,136** |
| full request with tool result | 17,042 | 8,943 | **−8,099** |

The upstream cap is 50 KiB / 2,000 lines (`packages/opencode/src/tool/truncate.ts`);
the fork lowers it to 16 KiB / 500 lines.

## Caveats (read this)

- These are **input-token** measurements, not a bill. Providers bill cache
  reads/writes and output tokens differently; a lower aggregate input count does
  not by itself prove a lower cost.
- The numbers are for a model that uses `default.txt`. For models upstream
  routes to a model-specific prompt (`claude`, `gemini`, `gpt`, …) the upstream
  system prompt is larger, so the delta is larger; run the harness with such a
  model id to see it.
- Removing material from previously cached history can invalidate cache reuse,
  which is a cost question this harness does not answer.
- This measures request payload size, which is a good proxy for API input tokens
  but not identical to any specific provider's tokenizer.
