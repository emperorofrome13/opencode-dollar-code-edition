# HANDOFF — Fork v1.00: launcher fix + prompt/tool trim (2026-09-17)

## What changed (surgical, 6 files)

1. **Launcher fix** — `script/windows-launcher.ps1`: removed bogus `--preload @opentui/solid/preload`
   from the backend start command. That module does not exist, so `quickstart.bat` died at
   step [3/4] with `error: preload not found`. Backend `serve` needs no Solid preload.
2. **Tool fat trim** (descriptions only — schemas, permissions, behavior untouched):
   - `packages/opencode/src/tool/shell/prompt.ts` (source 17,072 → 8,262 chars, −52%): removed
     Directory Verification pre-step, correct/incorrect quoting examples, good/bad XML examples,
     "command argument is required" filler; compressed PowerShell notes, chain guidance, and the
     dedicated-tools mapping (repeated 3×) to one line each. Kept: exact `commands will time out
     after ${defaultTimeoutMs}ms` wording (a test asserts it), interpolated truncation limits +
     Read/Grep recovery, workdir guidance, parallel-call guidance, Git safety section.
   - `task.txt` (2,324 → 1,289): dropped "outputs should generally be trusted" + proactive-use
     lecture; kept when-NOT-to-use routing, fresh-context/task_id semantics, write-vs-research + verify.
   - `todowrite.txt` (2,056 → 1,243): dropped all use/skip examples + "when in doubt use it";
     kept states, real-time/one-in_progress/verify-before-complete rules, verbatim-commands rule.
   - `websearch.txt` (1,047 → 295), `webfetch.txt` (763 → 197): dropped marketing filler; kept
     modes, year rule, URL/format essentials.
3. **Already in place from prior work (verified, not re-done)**: provider-template switch neutralized
   (`system.ts` returns the single compact `default.txt` for all models, ~258 tokens vs ~2,132 before);
   old provider `.txt` files are dead (zero references) so they cost nothing at runtime.
   `quickstart.bat` + `stop.bat` exist; fork version **v1.00** shown in browser title/header and launcher output.

## Verification (evidence, all PASS)

- `bun typecheck` in `packages/opencode`: exit 0, no errors.
- `bun test test/session/system.test.ts`: **45 pass, 0 fail**.
- `bun test test/tool/shell.test.ts`: **65 pass, 0 fail** (incl. timeout-wording assertion).
- `bun test test/tool/task.test.ts test/tool/truncation.test.ts test/skill/skill.test.ts`: **62 pass, 0 fail**.
- Prettier: `prompt.ts` was already non-clean at HEAD; still non-clean, no regression (diff is prose-only).
- **Launcher end-to-end**: `quickstart.bat -NoBrowser` → [1/4] deps OK → [2/4] UI build OK →
  [3/4] backend up → [4/4] frontend up → `OpenCode Fork v1.00 ready at http://127.0.0.1:4444`.
  With auth header: backend `/global/health` → `{"healthy":true,"version":"local"}`; frontend `/` → 200.
  (Direct unauthenticated calls 401 — server password auth is on in this environment, expected.)
- `stop.bat`: exit 0, both owned processes terminated, nothing else touched.

## Run command

Double-click `quickstart.bat` (or `quickstart.bat -NoBrowser` to skip opening the browser).
`stop.bat` stops only launcher-owned processes. Logs: `logs\launcher\`.

## Follow-up: fork AGENTS.md separated + trimmed (2026-09-18)

Root `AGENTS.md` was byte-identical to upstream (8,909 chars, ~2,227 tok) and loads as project
context in every session run from the repo. Rewrote it as fork-specific: 1,422 chars (~355 tok,
−84%). Kept SDK regen, `generate`, dep direction, `dev` branch, package-local test/typecheck,
Effect/module conventions, compressed V2 invariants, token-diet rule. Cut branch/commit
conventions, all Good/Bad style examples, drizzle example, verbose V2 bullets. Tests use fixture
files only; `instruction-context.test.ts` 7 pass. Global `~/.config/opencode/AGENTS.md` (user's
own) stays shared — correctly so.

## Follow-up: vertical left settings tabs (2026-09-18)

Replaced the prior horizontal top tab rows with a vertical left sidebar, as originally intended.
Both `Tabs` and `TabsV2` already ship full `settings`+`vertical` CSS — the work was removing the
horizontal overrides, not inventing layout.

- `dialog-settings.tsx`, `settings-v2/dialog-settings-v2.tsx`: `orientation="horizontal"` → `"vertical"`.
- `packages/app/src/index.css`: horizontal override block rewritten as a vertical grid
  (sidebar column + content column, footer spanning the bottom row). List/trigger styling comes
  from `tabs.css` settings+vertical rules.
- `settings-v2.css`: same grid treatment; list/trigger styling from `tabs-v2.css`.
- Footer stays pinned bottom via `grid-column: 1 / -1` (works because inactive tab contents unmount).

Verification (all PASS): app `bun run build` exit 0; prettier clean on all 4 files; Playwright +
installed Chrome against the running stack: tabs list bbox 240px wide at x=230, content at x=470
full-height, all 5 triggers clicked through, screenshots `vtabs-20260917/settings-vertical.png`.
Note: Ctrl+, always opens the V2 dialog in current builds (V1 auto-upgrades away), so V2 is the
visually verified path; the V1 flip is the identical one-line prop change. "No model results" in
shots is a scratch-env model-catalog quirk, unrelated. All test processes killed, ports free,
credential-derived test URL deleted.

## Follow-up: RTK installed + toggle (2026-09-18)

- Plugin: `opencode-rtk@0.0.1` project-local in `.opencode/node_modules` (pinned exact in
  `.opencode/package.json`), registered in `.opencode/opencode.jsonc` (default ON). Requires the
  `rtk` binary in PATH (present: 0.49.0 ≥ 0.27). No-op when rtk is missing; passes commands
  through unchanged on rewrite failure.
- Toggle: new `rtk` switch in Settings → General → Project context. PATCH adds/removes
  `./node_modules/opencode-rtk` in the project's `opencode.jsonc` plugin array (jsonc-preserving
  atomic write, same safeguards as DCP). Status `rtk` reflects the project file (live without
  restart); restart still required for the plugin to load/unload. Independent of DCP registration.
- Files: `config/context-settings.ts` (Patch/Status + updateRtk), regenerated SDK
  (`sdk/js` v2 gen carries `rtk`; `packages/client` regen no-op — endpoint unmodeled there),
  `context-settings-controller.ts` (union + guard), `settings-context.tsx` (row + status line),
  `i18n/en.ts` (4 keys; other locales fall back to English by dict-merge design),
  `test/server/httpapi-config.test.ts` (register/remove round-trip test).
- Verification: opencode + app typechecks pass; httpapi-config 4 pass; live plugin simulation —
  default-export loads, `tool.execute.before` exposed, `git status` → `rtk git status`, non-bash
  untouched, `echo hello` passes through; repo `opencode.jsonc` parses with 0 errors.
- Measured on this repo (chars): `git status` 7,862 → 6,131 (−22%); full `git diff HEAD`
  322,913 → 35,861 (−89%). NOTE: the "≈71K tokens saved" figure originally written here was
  wrong — it divided raw diff chars by 4 and ignored upstream's 50 KiB output cap. Correct
  model-visible delta is ~8.9K tokens (see "Feedback audit" at the end of this file).

## Follow-up: vertical sessions sidebar, fork v1.01 (2026-09-18)

Sessions no longer render as a horizontal top tab strip. The V2 (new-layout) shell now shows a
240px vertical "Sessions" sidebar on the left; the titlebar keeps only home / new-session / right
controls. Same tabs store, same rename/close/reorder/drag behavior, same mod+1..9 shortcuts.

- `titlebar-tab-strip.tsx`: new `orientation="horizontal" | "vertical"` prop (default horizontal,
  upstream behavior untouched). Vertical switches to `flex-col` + `overflow-y-auto`,
  `RestrictToVerticalAxis` drag modifier, full-width tab slots, top/bottom overflow fades instead
  of left/right. Slot components take a `vertical` flag for the width classes.
- `titlebar.tsx`: new optional `hideTabs` prop; the horizontal `<TitlebarTabStrip>` is wrapped in
  `<Show when={!props.hideTabs}>`. All tab bookkeeping (auto-add, remember, mod+T/W commands)
  still runs in the titlebar so nothing registers twice.
- New `session-sidebar.tsx`: `SessionSidebar` aside (`hidden md:flex`, `w-60`, V2 deep bg + muted
  right border) rendering `TitlebarTabStrip orientation="vertical"` off the shared `useTabs`
  store, with the same route→tab matching as the titlebar (display only).
- `layout-new.tsx`: `<Titlebar hideTabs>` + body row `<SessionSidebar />` + `<main flex-1>`.
- `i18n/en.ts`: +1 key `session.tabs.title` ("Sessions"; other locales fall back to English by
  dict-merge design, same as the RTK keys).
- Version bumped v1.00 → v1.01 (`packages/app/index.html` title + preload header,
  `script/windows-launcher.ps1` ready line); dist rebuilt.

Verification (all PASS): app `bun run typecheck` exit 0; `bun run build` exit 0 (dist contains
`session-sidebar`); targeted unit tests 18 pass / 0 fail (titlebar-history, settings);
`quickstart.bat -NoBrowser` → ready at :4444; Playwright (node runner, bundled
chromium-1243 — bun runner can't connect the debug pipe in this env) against the running stack:
`[data-slot="session-sidebar"]` bbox 240×838 at x=1 (left side, full height), no horizontal
strip in the titlebar, screenshot `packages/app/logs/verify-sessions-20260918/sessions-vertical.png`
(scratch env has zero sessions, so the list area is empty — structure verified by bbox).
`stop.bat` exit 0, ports free. Prettier: repo baseline is not prettier-clean (even untouched
files warn), so no --write; edits follow surrounding style.

- Toggle unlock fix (`settings-context.tsx`): `directory()` now falls back to `layout.home.selection().directory` then `layout.projects.list()[0]?.worktree` instead of returning `undefined` when `params.dir` is empty. This removes the `!directory()` gate that disabled all toggles on the home page; the disabled-state guard (`!controller.state.data || ...loading...`) and `registered`/`manualMode`/`automaticStrategies` sub-rules remain intact. Typecheck clean.

## Follow-up: settings-context toggle unlock fix (2026-09-18)

Before: opening Settings → General → Project context with no project open showed "Open a project to
change context settings." and disabled all 5 toggles (`compactSkills`, `dcp`, `manualMode`,
`automaticStrategies`, `rtk`) because `directory()` from `decode64(params.dir)` returned `undefined`.

After: `directory()` memo tries `sessionID` → `params.dir` (route) → home selection → first
open project. The toggles load/unlock against the selected/default directory. The `registered`
gate (`!state.data?.registered` still blocks `manualMode`/`automaticStrategies` unless DCP is
registered) and the `manualMode`→`automaticStrategies` dependency stay.

Files: only `packages/app/src/components/settings-context.tsx` (new file in working copy; imports
`useLayout`/`useServer` added, directory memo expanded; no prop/API change). Version stays
v1.01; build rebuilt clean.

- LM Studio fixture expanded (via `WebFetch` against `localhost:1234/v1/models`, the server's
  configured LM Studio endpoint per the fixture): `packages/opencode/test/tool/fixtures/models-api.json`
  `lmstudio.models` expanded from 3 hardcoded entries to 97 live entries (qwen 3.5/3.6/3.8,
  gemma, glm-4.7-flash, spark, ornith, bonsai, muse-glimmer, etc.). Fixture rebuilt clean.

## Known issues / next steps

- V2 Core tool descriptions not trimmed (separate inline strings; V2 prompt already neutral one-liner).
- Old provider prompt `.txt` files still on disk but unreferenced — delete only if you want the cosmetic cleanup.
- Root lint has a pre-existing unrelated octal-escape warning in session-ui; untouched by policy.

## Feedback audit + critical fixes (2026-09-25)

A reviewer raised ~10 objections to the fork's token-savings claims and repo hygiene.
Each was checked against the repo, the OpenRouter activity CSV, and local session DBs.
Verdict: **the token-trimming is real, but the published numbers were overstated and
several hygiene/install defects were real.** Details:

1. **"71K tokens saved" was wrong (confirmed).** It was `(322,913 − 35,861) / 4`.
   Upstream truncates tool output to 50 KiB / 2,000 lines; this fork to 16 KiB / 500
   (`packages/opencode/src/tool/truncate.ts` L14-15, `packages/core/src/tool-output-store.ts`
   L13-14). So upstream sent `min(322,913, 51,200) = 51,200 B` and the fork sends
   `min(35,861, 16,384) = 16,384 B`. Tokenizing a real 3.2 MB diff with `o200k_base`:
   51,200 B ≈ 13,062 tok vs 16,384 B ≈ 4,170 tok → **~8.9K tokens actually saved (~8×
   less than claimed)**. RTK contributed **0** on that call: its 35,861-char output is
   still above the 16 KiB cap, so the cap alone decides what the model sees.
2. **Plugin install was not reproducible (confirmed, now fixed).** `.opencode/opencode.jsonc`
   registers `@tarquinen/opencode-dcp` and `opencode-rtk`, but `.opencode/package.json` and
   `.opencode/package-lock.json` were git-ignored, so a clean checkout had no manifest and
   `npm ci` failed → the loader skipped both plugins. Fixed: both files are now committed
   (removed from `.opencode/.gitignore`) and `script/windows-launcher.ps1` falls back to
   `npm install` when no lockfile is present.
3. **"Behavior untouched" was false (confirmed).** `packages/opencode/src/session/system.ts`
   returns the single `default.txt` for every model, dropping the per-model templates; the
   compact skill index drops skill descriptions (`packages/core/src/skill/guidance.ts`
   `renderNames`); truncation limits were lowered.
4. **Passing unit tests ≠ task parity (valid point).** README wording softened accordingly.
5. **AGENTS.md saving is repo-scoped (confirmed).** Measured 8,748 ch / 1,893 tok →
   1,416 ch / 330 tok (−82.6%), but it only applies when working inside this repo.
6. **Benchmark insufficient (confirmed).** `benchmark_results.json` is only
   `status: executed_briefly`; no metrics.
7. **Cache-aware billing ignored (confirmed).** OpenRouter CSV `opencodefork` key
   (1,072 generations): prompt 102.8M, cached 92.3M (89.8% hit), fresh 10.5M,
   completion 684K, `cost_total` $1.5865, `cost_cache` −$5.3071. Aggregate token counts
   cannot isolate the fork's effect (cache dominates; tasks/models differ; most calls free).
8. **Session-DB comparison.** First-assistant input: fork ~7.6–9.3K (avg ~8.3K) vs
   upstream 1.18.31/1.18.32 ~9.5K avg. Real but modest, and confounded by task mix.
9. **Broken symlink (confirmed, fix documented).** `packages/app/src/custom-elements.d.ts`
   is git mode `120000` (symlink) with blob content `import "../../ui/src/custom-elements"`
   (upstream's target was `../../ui/src/custom-elements.d.ts`). On Linux/macOS this is a
   broken symlink; Windows materializes it as a regular file, hiding the bug. Convert to a
   normal file when applying:
   ```bash
   git rm --cached -- packages/app/src/custom-elements.d.ts
   git add -- packages/app/src/custom-elements.d.ts   # 120000 -> 100644, content kept
   ```
   (Verified in a throwaway repo: `git ls-files -s` flips `120000` → `100644`, same blob.)
10. **Tests depend on the uncommitted plugin (confirmed, mitigated by fix #2).**
    `packages/opencode/test/plugin/dcp.test.ts` reads the local DCP `package.json` (3.1.15);
    it now resolves after `npm ci --prefix .opencode`.
11. **115-file commit mixes unrelated changes (confirmed).** `cbc4bb571f` = 115 files,
    +54,417 / −13,761, including ~80 i18n locale files and a 63K-line
    `models-api.json` fixture rebuilt from a local `localhost:1234/v1/models` catalogue
    (HANDOFF itself documents this). Recommend splitting into focused commits.

### Corrected savings statement (use this)
- Static per-session overhead: system prompt 1,766 → 187 tok; shell prompt 3,993 → 1,942 tok;
  task 489→280, todowrite 456→279, webfetch 167→43, websearch 216→69. **≈ −4,287 tok/session**
  excluding the repo AGENTS.md, **≈ −5,850** including it.
- Oversized tool results: cap-driven, up to ~13.1K → ~4.2K model-visible tokens per result.
- These are token-count reductions, **not** dollar savings; billing depends on cache
  reads/writes and output tokens, which are unchanged.

### Verified this session
- Clean copy `E:\aiprojects\coders\other\opencodollarcode` (from `git archive HEAD`).
- `npm ci --prefix .opencode` → **added 137 packages, exit 0** after committing the manifest.
- `git rm --cached` + `git add` symlink→file conversion verified in a throwaway repo.
- Prompt token counts via `tiktoken` `o200k_base` on fork vs `cbc4bb571f^`.

## Live A/B evidence (2026-09-25)

The earlier savings numbers were derived from static prompt files and
character counts. To answer the "not demonstrated" critique, the fork and its
upstream parent (`cbc4bb571f^` = v1.18.31) were run against the **same mock
OpenAI-compatible server**, same project dir, same model/agent, same user
message, and the actual request bodies were captured and tokenized.

Harness (committed): `script/token-ab/`
- `mock-llm.ts` — OpenAI-compatible server; captures every request body to JSONL.
- `run.ts` — runs upstream + fork against it (`AB_UPSTREAM_CLI`, `AB_FORK_CLI`, `AB_OUT`, `AB_MSG`, `AB_TAG`).
- `analyze.py` — tokenizes captured bodies (`python analyze.py [dir] [tag]`).
- `tool.json` — optional forced tool call (used for the truncation test).
- `README.md` — method, run commands, recorded results, caveats.

Run (from the repo root):
```bash
AB_UPSTREAM_CLI="C:\Users\emper\AppData\Local\Temp\opencode\ocab\upstream\packages\opencode\src\index.ts" \
  bun run script/token-ab/run.ts
python script/token-ab/analyze.py
```

### First-request context (same 10 tools, msg "run the command")
| part | upstream | fork | delta |
|---|---:|---:|---:|
| raw request body | 9,335 | 6,372 | **−2,963** |
| messages JSON | 3,951 | 2,208 | −1,743 |
| system prompt | 3,612 | 2,033 | **−1,579** |
| tool definitions | 5,343 | 4,123 | **−1,220** |

Per-tool: `bash` 1,478→811 (−667), `task` 881→668 (−213), `todowrite`
698→496 (−202), `webfetch` 338→200 (−138); the other six are unchanged.

### Oversized tool result (forced ~1.2 MB bash output)
| measure | upstream | fork | delta |
|---|---:|---:|---:|
| tool result in context | 51,347 chars / 7,609 tok | 16,512 chars / 2,473 tok | **−5,136** |
| full follow-up request | 17,042 | 8,943 | **−8,099** |

### Honest caveats
- These are **input-token** reductions, not dollars. Billing depends on cache
  reads/writes and output tokens; shortening a stable prefix can help, but
  truncating cached history invalidates reuse from that point on.
- The system/tool deltas assume the same model; model-specific prompt selection
  was removed in this fork, so on some providers the delta differs.
- RTK/DCP are external; their benefit is only realized when their output fits
  under the 16 KiB cap (the cap, not RTK, determines the truncation example above).

## Published (2026-09-25)

The fixes and this evidence were pushed to `origin/dev`
(`https://github.com/emperorofrome13/opencode-dollar-code-edition.git`) as four
focused commits, rebased onto the remote's newer `8c89eaf6cd`:

- `e08ccdea43` fix: commit `.opencode` plugin manifest + lockfile and make launcher install them
- `2b1fbc4797` fix: convert `custom-elements.d.ts` from broken symlink to a regular file
- `548334a649` docs: replace unsubstantiated savings claims with live-measured A/B evidence
- `817950fae1` test: add reproducible token A/B harness (`script/token-ab`)

Verified after push: `origin/dev` tree has `custom-elements.d.ts` mode `100644`
(same blob), `script/token-ab/{mock-llm.ts,run.ts,analyze.py,tool.json,README.md}`
tracked, and `benchmark_results.json` intentionally left untracked.

Note: a redundant `.git`-less tree at `E:\aiprojects\coders\other\opencodellarcode`
(127.9 MB, from an earlier typo) still exists and can be deleted.

