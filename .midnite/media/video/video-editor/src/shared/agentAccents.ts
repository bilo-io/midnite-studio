/**
 * Each agent's brand accent — generated, do not edit.
 *
 * Written by `scripts/make-logo-cuts.mjs`, which is where the colours live,
 * because they are what cuts the `-color` files. This module exists for
 * components that need the hex itself rather than a file painted with it — a
 * shimmer crossing a mark has to be *that brand's* light, and a row of eleven
 * marks all flashing violet is a row of eleven marks flashing violet.
 *
 * The source is midnite-studio's own roster (`AgentDefinition.accent` in
 * `packages/shared/src/terminal.ts`), keyed by mark filename rather than by
 * agent id — the roster calls Antigravity `agy` and names its mark
 * `antigravity`, and it is the mark being coloured.
 *
 * An agent the roster carries no accent for is simply absent; callers fall back
 * to white, which is what `AgentLogo` does for its `-color` cut too.
 */
export const AGENT_ACCENT: Readonly<Record<string, string>> = {
  claude: "#D97757",
  cursor: "#0066FF",
  codex: "#10A37F",
  copilot: "#6E40C9",
  openclaude: "#8B5CF6",
  opencode: "#03B000",
  kilo: "#FF5500",
  cline: "#5F52FF",
  grok: "#FFFFFF",
};
