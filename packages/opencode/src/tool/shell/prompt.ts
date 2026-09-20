import { Schema } from "effect"
import DESCRIPTION from "./shell.txt"
import { PositiveInt } from "@opencode-ai/core/schema"
import { Global } from "@opencode-ai/core/global"
import { ShellID } from "./id"

const PS = new Set(["powershell", "pwsh"])
const CMD = new Set(["cmd"])

export type Limits = {
  maxLines: number
  maxBytes: number
}

export function parameterSchema() {
  return Schema.Struct({
    command: Schema.String.annotate({ description: "The command to execute" }),
    timeout: Schema.optional(PositiveInt).annotate({ description: "Optional timeout in milliseconds" }),
    workdir: Schema.optional(Schema.String).annotate({
      description: `The working directory to run the command in. Defaults to the current directory. Use this instead of 'cd' commands.`,
    }),
  })
}

export const Parameters = parameterSchema()
export type Parameters = Schema.Schema.Type<typeof Parameters>

function renderPrompt(template: string, values: Record<string, string>) {
  return template.replace(/\$\{(\w+)\}/g, (_, key: string) => {
    const value = values[key]
    if (value === undefined) throw new Error(`Missing shell prompt value: ${key}`)
    return value
  })
}

function shellDisplayName(name: string) {
  if (name === "pwsh") return "PowerShell (7+)"
  if (name === "powershell") return "Windows PowerShell (5.1)"
  if (name === "cmd") return "cmd.exe"
  return name
}

function powershellNotes(name: string) {
  if (name === "pwsh") {
    return `# PowerShell (7+) shell notes
- Supports \`&&\`/\`||\` chaining. Prefer full cmdlet names over aliases. Use \`$(...)\` for subexpressions, \`& "path with spaces/exe" args\` for spaced paths, backtick to escape.`
  }
  if (name === "powershell") {
    return `# Windows PowerShell (5.1) shell notes
- No \`&&\`; chain with \`cmd1; if ($?) { cmd2 }\`. Prefer full cmdlet names over aliases. Use \`$(...)\` for subexpressions, \`& "path with spaces/exe" args\` for spaced paths, backtick to escape.`
  }
  return ""
}

function chainGuidance(name: string) {
  if (name === "powershell") {
    return "Chain dependent commands with `cmd1; if ($?) { cmd2 }` ('&&' is unsupported in Windows PowerShell 5.1)."
  }
  return "Chain dependent commands with '&&' in a single call."
}

function bashCommandSection(chain: string, limits: Limits, defaultTimeoutMs: number) {
  return `Quote paths with spaces.
An optional timeout in milliseconds may be given; commands will time out after ${defaultTimeoutMs}ms.
If output exceeds ${limits.maxLines} lines or ${limits.maxBytes} bytes it is truncated and the full output is written to a file; use Read with offset/limit or Grep on that file instead of \`head\`/\`tail\`.
Prefer dedicated tools over shell equivalents: Glob (not find/ls), Grep (not grep/rg), Read (not cat/head/tail), Edit (not sed/awk), Write (not echo/heredoc); output text directly.
Run independent commands as parallel tool calls in one message. ${chain} Do not separate commands with newlines.`
}

function powershellCommandSection(
  name: string,
  chain: string,
  _pathSep: string,
  limits: Limits,
  defaultTimeoutMs: number,
) {
  return `${powershellNotes(name)}

Quote paths with spaces (use & for executables with spaces).
An optional timeout in milliseconds may be given; commands will time out after ${defaultTimeoutMs}ms.
If output exceeds ${limits.maxLines} lines or ${limits.maxBytes} bytes it is truncated and the full output is written to a file; use Read with offset/limit or Grep on that file instead of \`Select-Object\`.
Prefer dedicated tools: Glob (not Get-ChildItem), Grep (not Select-String), Read (not Get-Content), Edit (not Set-Content), Write (not Set-Content/Out-File); output text directly.
Run independent commands as parallel tool calls in one message. ${chain} Do not separate commands with newlines.`
}

function cmdCommandSection(chain: string, limits: Limits, defaultTimeoutMs: number) {
  return `# cmd.exe shell notes
- Quote paths with spaces. Use %VAR% for environment variables. Use \`call\` for batch files.
An optional timeout in milliseconds may be given; commands will time out after ${defaultTimeoutMs}ms.
If output exceeds ${limits.maxLines} lines or ${limits.maxBytes} bytes it is truncated and the full output is written to a file; use Read with offset/limit or Grep on that file instead of \`more\`.
Prefer dedicated tools: Glob (not dir /s), Grep (not findstr), Read (not type), Edit (not copy), Write (not echo >); output text directly.
Run independent commands as parallel tool calls in one message. ${chain} Do not separate commands with newlines.`
}

function profile(name: string, platform: NodeJS.Platform, limits: Limits, defaultTimeoutMs: number) {
  const isPowerShell = PS.has(name)
  const chain = chainGuidance(name)
  if (CMD.has(name)) {
    return {
      intro: `Executes a given ${shellDisplayName(name)} command with optional timeout, ensuring proper handling and security measures.`,
      workdirSection:
        "All commands run in the current working directory by default. Use the `workdir` parameter if you need to run a command in a different directory. AVOID changing directories inside the command - use `workdir` instead.",
      commandSection: cmdCommandSection(chain, limits, defaultTimeoutMs),
      gitCommands: "git commands",
      gitCommandRestriction: "git commands",
      createPrInstruction: "Create PR using a temporary body file so cmd.exe quoting stays simple.",
      createPrExample: `(\n  echo ## Summary\n  echo - ^<1-3 bullet points^>\n) > pr-body.txt\ngh pr create --title "the pr title" --body-file pr-body.txt`,
    }
  }
  if (isPowerShell) {
    return {
      intro: `Executes a given ${shellDisplayName(name)} command with optional timeout, ensuring proper handling and security measures.`,
      workdirSection:
        "All commands run in the current working directory by default. Use the `workdir` parameter if you need to run a command in a different directory. AVOID changing directories inside the command - use `workdir` instead.",
      commandSection: powershellCommandSection(
        name,
        chain,
        platform === "win32" ? "\\" : "/",
        limits,
        defaultTimeoutMs,
      ),
      gitCommands: "git commands",
      gitCommandRestriction: "git commands",
      createPrInstruction: "Create PR using gh pr create with a PowerShell here-string to pass the body correctly.",
      createPrExample: `gh pr create --title "the pr title" --body @'
## Summary
- <1-3 bullet points>
'@`,
    }
  }
  return {
    intro:
      "Executes a given bash command in a persistent shell session with optional timeout, ensuring proper handling and security measures.",
    workdirSection:
      "All commands run in the current working directory by default. Use the `workdir` parameter if you need to run a command in a different directory. AVOID using `cd <directory> && <command>` patterns - use `workdir` instead.",
    commandSection: bashCommandSection(chain, limits, defaultTimeoutMs),
    gitCommands: "bash commands",
    gitCommandRestriction: "git bash commands",
    createPrInstruction:
      "Create PR using gh pr create with the format below. Use a HEREDOC to pass the body to ensure correct formatting.",
    createPrExample: `gh pr create --title "the pr title" --body "$(cat <<'EOF'
## Summary
<1-3 bullet points>`,
  }
}

export function render(name: string, platform: NodeJS.Platform, limits: Limits, defaultTimeoutMs: number) {
  const selected = profile(name, platform, limits, defaultTimeoutMs)
  return {
    description: renderPrompt(DESCRIPTION, {
      intro: selected.intro,
      os: platform,
      shell: name,
      tmp: Global.Path.tmp,
      workdirSection: selected.workdirSection,
      commandSection: selected.commandSection,
      gitCommands: selected.gitCommands,
      toolName: ShellID.ToolID,
      gitCommandRestriction: selected.gitCommandRestriction,
      createPrInstruction: selected.createPrInstruction,
      createPrExample: selected.createPrExample,
    }),
    parameters: parameterSchema(),
  }
}

export * as ShellPrompt from "./prompt"
