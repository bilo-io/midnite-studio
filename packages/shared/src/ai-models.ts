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
 * Model info descriptor for an agent (Phase 111 Theme A).
 * Unifies loop models, cheap/fast model tiers, and local Ollama models.
 */
export type AgentModelInfo = {
  id: string;
  label: string;
  cliModel?: string | null;
  tier?: 'fast' | 'cheap' | 'default';
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

import { LOOP_MODELS } from './loops';
import { BUILTIN_AGENTS, type AgentDefinition } from './terminal';
import { editDistance } from './companion';

/**
 * Models available for `agentId`, unifying `LOOP_MODELS`, `cheapModelFor`/`fastModelFor`,
 * and local Ollama model lists.
 */
export function modelsForAgent(agentId: string, ollamaModels?: string[]): AgentModelInfo[] {
  const result: AgentModelInfo[] = [];
  const seenIds = new Set<string>();

  // 1. Loop models for Claude
  if (agentId === 'claude') {
    for (const lm of LOOP_MODELS) {
      const tier = lm.id === 'default' ? 'default' : lm.id.startsWith('haiku') ? 'cheap' : undefined;
      result.push({
        id: lm.id,
        label: lm.label,
        cliModel: lm.cliModel,
        ...(tier ? { tier } : {}),
      });
      seenIds.add(lm.id);
    }
  }

  // 2. cheap/fast tier models for this agent
  const cheap = cheapModelFor(agentId);
  const fast = fastModelFor(agentId);
  if (cheap && !seenIds.has(cheap)) {
    result.push({
      id: cheap,
      label: cheap,
      cliModel: cheap,
      tier: 'cheap',
    });
    seenIds.add(cheap);
  }
  if (fast && !seenIds.has(fast)) {
    result.push({
      id: fast,
      label: fast,
      cliModel: fast,
      tier: 'fast',
    });
    seenIds.add(fast);
  }

  // 3. Ollama models if provided
  if (ollamaModels && ollamaModels.length > 0) {
    for (const om of ollamaModels) {
      const trimmed = om.trim();
      if (!trimmed || seenIds.has(trimmed)) continue;
      result.push({
        id: trimmed,
        label: trimmed,
        cliModel: trimmed,
      });
      seenIds.add(trimmed);
    }
  }

  return result;
}

const AGENT_ALIASES: Record<string, string[]> = {
  claude: ['claude', 'claude code', 'anthropic'],
  codex: ['codex', 'openai'],
  agy: ['agy', 'antigravity', 'gemini', 'google'],
  cursor: ['cursor', 'cursor-agent'],
  copilot: ['copilot', 'github copilot'],
  openclaude: ['openclaude'],
  opencode: ['opencode'],
  kilo: ['kilo', 'kilo code', 'kilocode'],
  aider: ['aider'],
  cline: ['cline'],
  grok: ['grok', 'grok build', 'xai'],
  goose: ['goose'],
  ollama: ['ollama'],
};

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeKey(str: string): string {
  return normalizeString(str).replace(/\s+/g, '');
}

/**
 * Matches an agent input string against available agents (canonical id, label, or known aliases).
 * Returns the matching AgentDefinition or null.
 */
function matchAgent(input: string, agents: readonly AgentDefinition[]): AgentDefinition | null {
  const norm = normalizeString(input);
  const key = normalizeKey(input);
  if (!key) return null;

  // Exact ID match
  for (const a of agents) {
    if (a.id.toLowerCase() === norm || a.id.toLowerCase() === key) return a;
  }

  // Exact label match
  for (const a of agents) {
    if (normalizeString(a.label) === norm || normalizeKey(a.label) === key) return a;
  }

  // Known aliases match
  for (const [canonicalId, aliases] of Object.entries(AGENT_ALIASES)) {
    for (const alias of aliases) {
      if (normalizeString(alias) === norm || normalizeKey(alias) === key) {
        const found = agents.find((a) => a.id === canonicalId);
        if (found) return found;
      }
    }
  }

  // Substring or prefix match
  for (const a of agents) {
    const aKey = normalizeKey(a.id);
    const aLabelKey = normalizeKey(a.label);
    if (aKey.startsWith(key) || key.startsWith(aKey) || aLabelKey.startsWith(key) || key.startsWith(aLabelKey)) {
      return a;
    }
  }

  // Levenshtein fuzzy match
  let bestAgent: AgentDefinition | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const a of agents) {
    const candidates = [a.id, a.label, ...(AGENT_ALIASES[a.id] ?? [])];
    for (const cand of candidates) {
      const candKey = normalizeKey(cand);
      const dist = editDistance(key, candKey);
      const maxAllowed = candKey.length >= 5 ? 2 : candKey.length >= 4 ? 1 : 0;
      if (dist <= maxAllowed && dist < bestDist) {
        bestDist = dist;
        bestAgent = a;
      }
    }
  }

  return bestAgent;
}

/**
 * Matches a model input string against known models for an agent.
 */
function matchModel(modelInput: string, models: AgentModelInfo[]): string | null {
  const norm = normalizeString(modelInput);
  const key = normalizeKey(modelInput);
  if (!key) return null;

    // Exact ID or label or cliModel match (prefer loop model aliases if present)
  const modelAliases: Record<string, string[]> = {
    'haiku-4-5': ['haiku', 'haiku 4.5', 'haiku-4.5', 'claude-haiku-4-5'],
    'sonnet-5': ['sonnet 5', 'sonnet-5', 'sonnet', 'claude-sonnet-5'],
    'sonnet-5-5': ['sonnet 5.5', 'sonnet-5.5', 'sonnet 5 5', 'claude-sonnet-5-5'],
    'opus-4-8': ['opus 4.8', 'opus-4.8', 'claude-opus-4-8'],
    'opus-5': ['opus 5', 'opus-5', 'opus', 'claude-opus-5'],
    'opus-5-5': ['opus 5.5', 'opus-5.5', 'opus 5 5', 'claude-opus-5-5'],
    'fable-5': ['fable 5', 'fable-5', 'fable', 'claude-fable-5'],
    'fable-5-1': ['fable 5.1', 'fable-5.1', 'claude-fable-5-1'],
  };

  for (const [targetId, aliases] of Object.entries(modelAliases)) {
    if (models.some((m) => m.id === targetId)) {
      for (const alias of aliases) {
        if (normalizeString(alias) === norm || normalizeKey(alias) === key) {
          return targetId;
        }
      }
    }
  }

  for (const m of models) {
    if (m.id.toLowerCase() === norm || normalizeKey(m.id) === key) return m.id;
    if (normalizeString(m.label) === norm || normalizeKey(m.label) === key) return m.id;
    if (m.cliModel && (m.cliModel.toLowerCase() === norm || normalizeKey(m.cliModel) === key)) return m.id;
  }

  // Prefix or substring match in model ID / label / cliModel
  for (const m of models) {
    const mKey = normalizeKey(m.id);
    const mLabelKey = normalizeKey(m.label);
    if (mKey.includes(key) || key.includes(mKey) || mLabelKey.includes(key) || key.includes(mLabelKey)) {
      return m.id;
    }
  }

  // Levenshtein fuzzy match
  let bestModelId: string | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const m of models) {
    const candidates = [m.id, m.label, ...(m.cliModel ? [m.cliModel] : []), ...(modelAliases[m.id] ?? [])];
    for (const cand of candidates) {
      const candKey = normalizeKey(cand);
      const dist = editDistance(key, candKey);
      const maxAllowed = candKey.length >= 6 ? 2 : candKey.length >= 4 ? 1 : 0;
      if (dist <= maxAllowed && dist < bestDist) {
        bestDist = dist;
        bestModelId = m.id;
      }
    }
  }

  return bestModelId;
}

/**
 * Resolves an agent and optional model input string against available agents and their models.
 * Returns `{ agentId, modelId }` or `{ error }`.
 */
export function resolveAgentAndModel(
  agentInput: string,
  modelInput?: string,
  availableAgents?: readonly AgentDefinition[],
): { agentId: string; modelId: string | null } | { error: string } {
  const trimmedAgent = agentInput.trim();
  if (!trimmedAgent) {
    return { error: 'Agent name is required' };
  }

  const agents = availableAgents ?? BUILTIN_AGENTS;
  const agent = matchAgent(trimmedAgent, agents);
  if (!agent) {
    return { error: `Unknown agent: ${trimmedAgent}` };
  }

  if (!modelInput || !modelInput.trim()) {
    return { agentId: agent.id, modelId: null };
  }

  const trimmedModel = modelInput.trim();
  const knownModels = modelsForAgent(agent.id);
  const matchedModelId = matchModel(trimmedModel, knownModels);

  if (!matchedModelId) {
    // If the agent accepts Ollama models and the input looks like an Ollama model name,
    // or if the agent has no fixed model catalogue, we can still validate or report unknown.
    return { error: `Unknown model: ${trimmedModel} for agent: ${agent.label}` };
  }

  return { agentId: agent.id, modelId: matchedModelId };
}

