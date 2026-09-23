/**
 * Per-provider fast/cheap model registry (Phase 95 Theme E) — the wand
 * (`ai:improveField`) and, later, Theme F's "Plan with AI" (`ai:planBlueprint`)
 * both need a *cheap* or *fast* model rather than whatever an interactive
 * session defaults to: a field rewrite or a blueprint draft is a short,
 * disposable call that should not spend a flagship model's latency or price
 * on it.
 *
 * Split from `agent-invocation.ts` rather than folded into it: that file maps
 * an `agentId` to the flags that start a CLI at all (`-p`, `exec`, …) and is
 * shared with the interactive/headless terminal launcher — a table of model
 * *names*, which change far more often than a CLI's invocation grammar, has
 * no business living beside it or forcing a second look at every terminal
 * call site when a vendor renames a model.
 *
 * **Coverage is honest, not exhaustive.** Only the providers with a
 * documented, stable "small" model get an entry — `agentHeadlessArgs`
 * recognises every roster id, but the ones left out here (OpenCode, Copilot,
 * Cline, Aider, OpenClaude, Kilo, Goose) either resolve their model from the
 * user's own provider config or have no CLI-flag-selectable second tier
 * verified against public docs. `cheapModelFor`/`fastModelFor` return `null`
 * for those — "run with whatever the CLI already defaults to" — rather than a
 * guessed flag that could point at a model the account cannot reach. Gemini
 * is listed even though it is not one of `agentHeadlessArgs`' known ids
 * (there is no bundled `gemini` CLI entry in the roster yet) — the phase doc
 * names it explicitly as a future roster member, and the row costs nothing
 * to carry ahead of that CLI landing.
 *
 * **Model names are a snapshot, not a contract.** Unlike `agentHeadlessArgs`'
 * flags (verified against `docs/AGENTS_CLI.md`), a provider's own "cheapest
 * current model" moves under a vendor's own release cadence with no local
 * doc to check it against — the same "documented as unverified" posture
 * Theme D already took for Azure's default work-item type and Bitbucket's
 * own review-id assumption, rather than a live probe this app has no way to
 * run before spending the call.
 */

/** One provider's two non-default tiers. `cheap` and `fast` are the same
 *  model for every provider below today — the industry's own "small" model is
 *  usually both — but kept as two fields (not one) because a provider that
 *  ever splits them (a cheap-but-slow batch model vs. a fast-but-pricier one)
 *  should not force every caller to rename its field. */
export type AiModelTier = {
  cheap: string;
  fast: string;
};

/**
 * Claude: `haiku` is the CLI's own documented model alias (`claude --model
 * haiku`), not a full model id — using the alias means this table tracks
 * Anthropic's own "the current haiku" pointer instead of a specific
 * snapshot that ages out from under it.
 *
 * Codex: OpenAI's mini tier, the direct "codex → its mini model" the phase
 * doc names.
 *
 * Gemini / Antigravity (`agy`): Google's Flash tier — Antigravity runs on
 * Gemini, so it takes the same row.
 *
 * Grok: xAI's fast tier.
 */
const AI_MODELS: Partial<Record<string, AiModelTier>> = {
  claude: { cheap: 'haiku', fast: 'haiku' },
  codex: { cheap: 'gpt-5-mini', fast: 'gpt-5-mini' },
  gemini: { cheap: 'gemini-2.5-flash', fast: 'gemini-2.5-flash' },
  agy: { cheap: 'gemini-2.5-flash', fast: 'gemini-2.5-flash' },
  grok: { cheap: 'grok-4-fast', fast: 'grok-4-fast' },
  cursor: { cheap: 'auto', fast: 'auto' },
};

/** The cheapest model this app knows for `agentId`, or `null` when none is
 *  documented — see the module doc for what `null` means to a caller. */
export function cheapModelFor(agentId: string): string | null {
  return AI_MODELS[agentId]?.cheap ?? null;
}

/** The fastest (not necessarily cheapest) model this app knows for
 *  `agentId`, or `null` when none is documented. */
export function fastModelFor(agentId: string): string | null {
  return AI_MODELS[agentId]?.fast ?? null;
}

/**
 * The flag(s) that select `model` on `agentId`'s CLI, for a headless call
 * already resolved to a known model (from {@link cheapModelFor} /
 * {@link fastModelFor} — never called with a `null` model).
 *
 * `--model <name>` is the one flag verified across Claude, Codex and Cursor's
 * own `--help` output; every entry in {@link AI_MODELS} uses it, so a single
 * default covers the whole table today and a provider that ever needs a
 * different flag gets its own `case` when it is added, exactly like
 * `agentHeadlessArgs`' own per-agent switch.
 */
export function modelArgsFor(_agentId: string, model: string): string[] {
  return ['--model', model];
}
