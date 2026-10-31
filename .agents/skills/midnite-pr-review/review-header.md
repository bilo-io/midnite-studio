# Review header (agent logo + model name + effort)

Every review **summary body** this skill family posts to a PR (a `COMMENT` review with findings, or a
plain "nothing came up" / "concerns resolved" comment review) opens with one header line, then a blank
line, then the usual body. **Bare approvals stay as they are** (`LGTM 🚀` etc., no header).

## Markup

One line, no table, no CSS (GitHub strips `style` and `class`, and inline `<svg>`):

```
<img src="LOGO_URL" height="20" align="absmiddle" alt="AGENT"> **MODEL_NAME** (effort: EFFORT)
```

Example:

```
<img src="https://bilo-io.github.io/midnite-ui/agents/claude-color.svg" height="20" align="absmiddle" alt="Claude"> **Claude Opus 5.5** (effort: medium)
```

No provider name ("Anthropic", "OpenAI", …): the logo already says whose model it is.

## Filling it in

- **MODEL_NAME**: the human-readable name of your own model, as its vendor writes it: `Claude Opus 5.5`,
  `Claude Sonnet 5.5`, `Claude Haiku 5.5`, `Claude Fable 5.1`, `GPT-5 Codex`, `Gemini 2.5 Pro`. Derive it
  from your exact model id (stated in your system prompt in Claude Code), e.g. `claude-opus-5-5` →
  `Claude Opus 5.5`. Never copy the example above and never guess; if only the raw id is known, write the
  id; if nothing is known, write `unknown model`.
- **EFFORT**: the effort level you are running at (low / medium / high / xhigh / max, from the session's
  effort setting). If it cannot be known, write `default`.
- **AGENT / LOGO_URL**: from the table. Unknown agent: drop the `<img>` and write
  `**MODEL_NAME** (effort: EFFORT)` as text only.

`BASE` = `https://bilo-io.github.io/midnite-ui/agents`
(the public midnite-ui site, served as `image/svg+xml` so it renders; the files live in
`bilo-io/midnite-ui` at `packages/ui/assets/agents/`, which has every agent's mark).

| Agent | LOGO_URL |
|---|---|
| Claude (Claude Code) | `BASE/claude-color.svg` |
| Codex | `BASE/codex-color.svg` |
| Gemini | `BASE/gemini.svg` |
| Antigravity | `BASE/antigravity.svg` |
| Copilot | `BASE/copilot-color.svg` |
| Cursor | `BASE/cursor-color.svg` |
| Grok | `BASE/grok-ink.svg` |

Write the header into the JSON `body` (or `--body`) as the first line followed by `\n\n`; escape the
double quotes in the attributes when it sits inside a JSON string.
