# opencode dollar code edition

> **Unofficial independent fork — NOT an OpenCode product, and NOT made by,
> affiliated with, or supported by the OpenCode team (SST).** This is a
> community fork maintained and customized by [@emperorofrome13](https://github.com/emperorofrome13). Original OpenCode code belongs to its owners;
> upstream docs and links below refer to their project, not this fork. If you
> want the official product, go to [opencode.ai](https://opencode.ai) or
> [sst/opencode](https://github.com/sst/opencode).

A leaner, cheaper-to-run fork of [opencode](https://github.com/sst/opencode).
Upstream's README is kept below for reference; install instructions down there
point at upstream — **to get THIS edition, use the links above, not those**.

## Get this edition

- **Windows installer (recommended):**
  [Releases](https://github.com/emperorofrome13/opencode-dollar-code-edition/releases)
  → `opencode-desktop-win-x64.exe`. Per-user install, no admin needed.
- **From source:** `quickstart.bat` (double-click; Windows) or
  `bun install && bun dev`. Stop with `stop.bat`.

## Why this fork (benefits over upstream)

Measured end-to-end on real runs, not estimated. The reproducible harness is in
[`script/token-ab/`](./script/token-ab/): it runs the upstream base and this fork against a
mock LLM and tokenizes the exact request bodies each sends (`o200k_base`). These are
**input-token** reductions, not a dollar figure: billing also depends on cache reads/writes
and output tokens, which this fork does not change. Raw numbers are in [HANDOFF.md](./HANDOFF.md).

- **~30% less context per turn (live-measured).** On the first request the fork sends
  **−2,964 tokens** vs upstream (**9,333 → 6,369**, **−31.7%**): system prompt **−1,580**,
  tool definitions **−1,220** (same 10 tools). One compact `default.txt` replaces the
  per-model system prompts (1,766 → 187 tokens); shell prompt 3,993 → 1,942; task /
  todowrite / webfetch / websearch trimmed. Static prompt-file overhead reduction
  ≈ **−4,300 tokens per session** (≈ −5,850 when the fork's own repo `AGENTS.md` applies).
  Schemas and permissions are untouched; prompt selection and output limits are
  deliberately changed (see below).
- **Smaller tool results (live-measured).** Tool-output truncation lowered from 50 KiB /
  2,000 lines to 16 KiB / 500 lines. On a ~1.2 MB `bash` result the model sees 2,473 tokens
  instead of 7,609 (**−5,136**); the full follow-up request is **−8,099**. Cap-driven, at
  the cost of the model seeing less of that output.
- **A ~10M-token job sends ~68% fewer input tokens (live-measured).** 56 large tool
  results (~1.2 MB / ~180K tokens each ≈ **10.1M tokens of raw output**) in one session:
  upstream sends **12,300,010** cumulative input tokens, the fork **3,984,325** —
  **−8,315,685 (−67.6%)** — and the final context is 421,962 vs 134,799 tokens. Same
  commands, same model, only the fork's prompts + truncation differ.
- **RTK command compression (optional, external).** This is **not this fork's claim** —
  quoted from [RTK's own README](https://github.com/rtk-ai/rtk): *"High-performance CLI
  proxy that cuts up to 90% of the bash output your agent reads"* and *"reduces LLM token
  consumption by 60-90% on common dev commands."* RTK itself cautions that this is
  bash-output reduction, *"not the same as cutting your bill by 90%"*, and that its
  absolute token numbers are `bytes / 4` estimates. This fork only wires the plugin; the
  compression is RTK's. Requires the `rtk` binary in PATH and the project-plugin install
  (see below). No-op when `rtk` is missing.
- **Windows launcher that works.** `quickstart.bat` double-click start
  (deps → UI build → backend → frontend) plus `stop.bat`; fixed the bogus
  Solid preload that killed the upstream launcher at step 3/4.
- **Calmer desktop UI.** Vertical sessions sidebar (no horizontal tab strip),
  vertical settings tabs, version in the title/header.
- **Full desktop app.** `packages/desktop` (Electron, same approach as opencode
  desktop) builds the `opencode dollar code edition` installer:
  `bun run build && bun run package` in `packages/desktop`.
- **Same engine, targeted tests green.** system 45, shell 65, task/truncation/skill 62.
  Green suites show the changed code paths behave; they are not a claim of equivalent
  task performance on every model or workflow.

### Project plugins (DCP / RTK)

The `opencode-dcp` and `opencode-rtk` plugins are declared in
`.opencode/opencode.jsonc` and pinned in the committed `.opencode/package.json` +
`.opencode/package-lock.json`. Install them once:

```bash
npm ci --prefix .opencode        # or: bun install --cwd .opencode
```

`quickstart.bat` does this automatically (and falls back to `npm install` if the
lockfile is missing). If you skip it, the plugin loader skips both plugins and the
compression features are simply off.

## Inkling Free output comparison

For the model-ranking page benchmark, this fork used 113,816 logged total tokens
versus 246,803 for regular OpenCode (53.9% fewer). Manual source-code-quality
review scored the generated pages 7/10 and 5/10, respectively.

---

<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode logo">
    </picture>
  </a>
</p>
<p align="center">The open source AI coding agent. (Upstream project badges and links below refer to sst/opencode, not this fork.)</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.bs.md">Bosanski</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.uk.md">Українська</a> |
  <a href="README.bn.md">বাংলা</a> |
  <a href="README.gr.md">Ελληνικά</a> |
  <a href="README.vi.md">Tiếng Việt</a>
</p>

[![OpenCode Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://opencode.ai)

---

### Installation

```bash
# YOLO
curl -fsSL https://opencode.ai/install | bash

# Package managers
npm i -g opencode-ai@latest        # or bun/pnpm/yarn
scoop install opencode             # Windows
choco install opencode             # Windows
brew install anomalyco/tap/opencode # macOS and Linux (recommended, always up to date)
brew install opencode              # macOS and Linux (official brew formula, updated less)
sudo pacman -S opencode            # Arch Linux (Stable)
paru -S opencode-bin               # Arch Linux (Latest from AUR)
mise use -g opencode               # Any OS
nix run nixpkgs#opencode           # or github:anomalyco/opencode for latest dev branch
```

> [!TIP]
> Remove versions older than 0.1.x before installing.

### Desktop App (BETA)

OpenCode is also available as a desktop application. Download directly from the [releases
page](https://github.com/anomalyco/opencode/releases) or [opencode.ai/download](https://opencode.ai/download).

> Fork note: those are upstream's downloads. THIS edition's Windows installer is on
> [this fork's releases page](https://github.com/emperorofrome13/opencode-dollar-code-edition/releases).

| Platform              | Download                           |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `opencode-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `opencode-desktop-mac-x64.dmg`     |
| Windows               | `opencode-desktop-windows-x64.exe` |
| Linux                 | `.deb`, `.rpm`, or `.AppImage`     |

```bash
# macOS (Homebrew)
brew install --cask opencode-desktop
# Windows (Scoop)
scoop bucket add extras; scoop install extras/opencode-desktop
```

#### Installation Directory

The install script respects the following priority order for the installation path:

1. `$OPENCODE_INSTALL_DIR` - Custom installation directory
2. `$XDG_BIN_DIR` - XDG Base Directory Specification compliant path
3. `$HOME/bin` - Standard user binary directory (if it exists or can be created)
4. `$HOME/.opencode/bin` - Default fallback

```bash
# Examples
OPENCODE_INSTALL_DIR=/usr/local/bin curl -fsSL https://opencode.ai/install | bash
XDG_BIN_DIR=$HOME/.local/bin curl -fsSL https://opencode.ai/install | bash
```

### Agents

OpenCode includes two built-in agents you can switch between with the `Tab` key.

- **build** - Default, full-access agent for development work
- **plan** - Read-only agent for analysis and code exploration
  - Denies file edits by default
  - Asks permission before running bash commands
  - Ideal for exploring unfamiliar codebases or planning changes

Also included is a **general** subagent for complex searches and multistep tasks.
This is used internally and can be invoked using `@general` in messages.

Learn more about [agents](https://opencode.ai/docs/agents).

### Documentation

For more info on how to configure OpenCode, [**head over to our docs**](https://opencode.ai/docs).

### Contributing

If you're interested in contributing to OpenCode, please read our [contributing docs](./CONTRIBUTING.md) before submitting a pull request.

### Building on OpenCode

If you are working on a project that's related to OpenCode and is using "opencode" as part of its name, for example "opencode-dashboard" or "opencode-mobile", please add a note to your README to clarify that it is not built by the OpenCode team and is not affiliated with us in any way.

---

**Join our community** [Discord](https://discord.gg/opencode) | [X.com](https://x.com/opencode)
