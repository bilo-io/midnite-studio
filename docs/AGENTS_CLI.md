## Antigravity (agy)
Antigravity allows you to jump straight into a continuous agent loop or execute a quick one-off task depending on the flag you use.
### Interactive
```bash
agy --prompt-interactive "Review this repository and ask before changing files"
```
### Headless
```bash
agy -p "Run the test suite and report failures" --dangerously-skip-permissions
```

## Cursor CLI (`cursor-agent`)
Cursor's terminal agent defaults to launching its TUI when given a text prompt, but provides a print flag for silent execution.
### Interactive
```bash
cursor-agent "refactor the auth module"
```
### Headless
```bash
cursor-agent -p "find and fix performance issues"
```

## OpenCode
OpenCode clearly separates its visual chat session from its continuous-integration-friendly execution by using a dedicated `run` subcommand.
### Interactive
```bash
opencode --prompt "Explain the use of context in Go"
```
### Headless
```bash
opencode run "Explain the use of context in Go"
```

## Grok CLI (`grok`)
The Grok terminal tool mirrors standard UNIX patterns, launching a chat session by default or acting as a standard out pipeline tool when the print flag is passed.
### Interactive
```bash
grok "Help me understand this project structure"
```
### Headless
```bash
grok -p "explain the auth module"
```

## OpenAI Codex CLI (`codex`)
Codex utilizes an `exec` subcommand for automated scripts, while standard interactive sessions are usually launched bare before typing internal slash commands.
### Interactive
```bash
codex
# (Then type: /task fix the tests)
```
### Headless
```bash
codex exec "fix the tests"
```

## GitHub Copilot CLI (`gh copilot`)
GitHub's CLI tool natively prompts you with interactive confirmation menus for shell suggestions, but can be bypassed or used for direct terminal explanations.
### Interactive
```bash
gh copilot suggest "find all python files modified today"
```
### Headless
```bash
gh copilot explain "find . -type f -name '*.py' -mtime -1"
```

## Cline
Cline detects its environment and auto-switches to headless mode in CI/CD pipelines, relying on the auto-approve flag to run entirely without user intervention.
### Interactive
```bash
cline "verify TypeScript types"
```
### Headless
```bash
cline --auto-approve true "verify TypeScript types"
```

## Aider
Aider defaults to an interactive chat interface but can be forced into a single-pass headless execution by automatically answering "yes" to all routing and commit prompts.
### Interactive
```bash
aider --message "Fix the bugs in task.go"
```
### Headless
```bash
aider --message "Fix the bugs in task.go" --yes-always
```

## OpenClaude
OpenClaude provides a unified workspace for both local and cloud models, using standard terminal initialization for chat and offering a background process mode (or a separate gRPC server) for unattended operations.
### Interactive
```bash
openclaude chat "Update the README"
```
### Headless
```bash
openclaude --bg 
```

## Kilo Code
Kilo Code provides a heavily keyboard-focused Terminal UI (TUI) for interactive architectural planning and coding, but allows passing commands straight to the agent framework.
### Interactive
```bash
kilo 
# (Opens the TUI environment)
```
### Headless
```bash
kilo run "format the codebase"
```

## Goose
Goose (by Block) is built as a fully autonomous agent that can manage long-running sessions, offering a dedicated run command to bypass the chat interface for batch processing.
### Interactive
```bash
goose session start --instruction "setup the boilerplate"
```
### Headless
```bash
goose run -t "Analyze test failures and fix them"
```