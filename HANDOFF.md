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
  322,913 → 35,861 (−89%, ≈71K tokens saved on one call); `--stat` and `--oneline log` already
  compact, unchanged. V1 runtime only (same as DCP).

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

## Follow-up: guard upstream cleanup workflows (2026-09-23)

The scheduled `close-issues` and `close-prs` Actions were targeting `anomalyco/opencode` from this independent repository. Their repository-scoped tokens cannot write to upstream, so both failed with 403 errors and generated GitHub CI activity notifications.

Both scripts now exit successfully unless they run in the canonical `anomalyco/opencode` repository. This prevents the fork's scheduled jobs from attempting upstream writes. The README already states that this fork is unofficial and unaffiliated with the OpenCode team, so no README edit was needed.

Verification: latest failure logs confirmed the 403 write attempts; this repository currently has zero open issues and zero open pull requests. Manual guard checks on Windows PowerShell:

```powershell
$env:GITHUB_REPOSITORY = 'emperorofrome13/opencode-dollar-code-edition'
bun script/github/close-issues.ts
bun script/github/close-prs.ts --dry-run
```

Both should print a skip message and exit successfully without needing a token. Current change is in draft PR #1; merge it to apply. At last check, 3 GitHub checks had passed and 7 remained queued.
## Known issues / next steps

- V2 Core tool descriptions not trimmed (separate inline strings; V2 prompt already neutral one-liner).
- Old provider prompt `.txt` files still on disk but unreferenced — delete only if you want the cosmetic cleanup.
- Root lint has a pre-existing unrelated octal-escape warning in session-ui; untouched by policy.
