/**
 * Ollama Theme H — putting a roster agent on a local/cloud Ollama model.
 *
 * Every agent CLI speaks to a *provider* differently, and none of the five
 * this phase targets (claude, codex, cline, opencode, copilot) has an
 * `--ollama` flag of its own — see the phase doc's "Ollama facts" section for
 * the citations. So this module is a small, pure recipe table: given an
 * agent id, a model name and the daemon's base URL, it says what env vars to
 * set and what to change about the invocation. Nothing here touches a pty, a
 * process or a store — those are `desktop/src/main/pty-service.ts`'s job
 * (env) and `start-agent.ts`/`council-runner.ts`/`node-sessions.ts`'s job
 * (words) — every one of which calls {@link resolveAgentLaunch}, the ONE
 * resolver, rather than re-deriving this table.
 */
import { z } from 'zod';

/**
 * The persisted per-agent choice — "does this roster entry run against its
 * own CLI/API, or against a local/cloud Ollama model". Lives in the
 * renderer's persisted agent preferences (`ui-store.ts`'s `agentBackends`),
 * not `agents.json` — a user's hand-edited roster file should never be
 * rewritten by a Settings ▸ Agent pick. Mirrored into main
 * (`settings-mirror.ts`) so the two launch paths that run in main
 * (`council-runner.ts`, workflow `node-sessions.ts`) can resolve the same
 * binding a terminal session would.
 */
export const AgentOllamaBindingSchema = z.object({
  backend: z.enum(['native', 'ollama']),
  /** Required in practice once `backend === 'ollama'` — left optional so a
   *  binding can name "use Ollama" before a model is picked yet, without the
   *  whole record failing to parse. */
  model: z.string().min(1).optional(),
});
export type AgentOllamaBinding = z.infer<typeof AgentOllamaBindingSchema>;

export const AgentOllamaBindingsSchema = z.record(z.string(), AgentOllamaBindingSchema);
export type AgentOllamaBindings = z.infer<typeof AgentOllamaBindingsSchema>;

/** The five roster agents this theme wires an Ollama backend for. */
export const OLLAMA_BACKED_AGENTS = ['claude', 'codex', 'cline', 'opencode', 'copilot'] as const;
export type OllamaBackedAgentId = (typeof OLLAMA_BACKED_AGENTS)[number];

export function supportsOllamaBackend(agentId: string): agentId is OllamaBackedAgentId {
  return (OLLAMA_BACKED_AGENTS as readonly string[]).includes(agentId);
}

/**
 * The sentinel Claude Code's own docs give for talking to an OpenAI-API-compatible
 * (or here, Anthropic-compatible) local endpoint that needs no real key —
 * never a secret, unlike a vault-held cloud `OLLAMA_API_KEY` (Theme F).
 */
export const OLLAMA_LOCAL_AUTH_TOKEN = 'ollama';

/**
 * The daemon's default local base URL — `OLLAMA_HOST`'s own default. Main
 * resolves the live value from the environment
 * (`ollama/client.ts#resolveOllamaBaseUrl`); this is the fallback every
 * caller that cannot read `process.env` (the renderer) starts from, and the
 * one main itself falls back to with no override set. There is no Settings ▸
 * Ollama host-override page yet (Theme C's own scope), so this constant is
 * the only base URL a renderer-launched session can use today.
 */
export const OLLAMA_DEFAULT_BASE_URL = 'http://127.0.0.1:11434';

export type OllamaLaunchRecipe = {
  /** Environment variables to merge into the pty's per-session env. */
  env: Record<string, string>;
  /** CLI words inserted right after the command, ahead of the agent's own invocation args and prompt. */
  argsBefore: string[];
  /** Set only when the agent's own binary cannot be told to use Ollama directly (cline, opencode) — replaces `command`. */
  commandOverride?: string;
};

/**
 * The per-agent Ollama launch recipe — a pure table, unit-tested row by row.
 *
 * `base` is the daemon's (or `https://ollama.com`'s, once Theme F wires
 * cloud) URL with no trailing slash. `authToken` is `'ollama'` for the local
 * daemon (no real credential) or a vault-held `OLLAMA_API_KEY` against
 * `ollama.com` — Theme F's own scope; this PR only ever calls it with the
 * default.
 *
 * Returns `null` for an agent this phase does not wire (anything outside
 * {@link OLLAMA_BACKED_AGENTS}) — callers treat `null` exactly like "no
 * Ollama binding", i.e. run the agent natively.
 */
export function ollamaLaunchRecipe(
  agentId: string,
  model: string,
  base: string,
  authToken: string = OLLAMA_LOCAL_AUTH_TOKEN,
): OllamaLaunchRecipe | null {
  switch (agentId) {
    case 'claude':
      return {
        env: {
          ANTHROPIC_BASE_URL: base,
          ANTHROPIC_AUTH_TOKEN: authToken,
          // Empty, not absent — Claude Code refuses to start with a stale
          // real key still set from a native run. Kept as `''` rather than
          // dropped, which is exactly what the per-session env's own
          // empty-string-preservation rule exists for.
          ANTHROPIC_API_KEY: '',
        },
        argsBefore: ['--model', model],
      };
    case 'copilot':
      return {
        env: {
          COPILOT_PROVIDER_BASE_URL: `${base}/v1`,
          COPILOT_PROVIDER_API_KEY: '',
          COPILOT_PROVIDER_WIRE_API: 'responses',
          COPILOT_MODEL: model,
        },
        argsBefore: [],
      };
    case 'codex':
      // No env, no config file — `--oss` alone tells Codex to talk to a local
      // OpenAI-compatible server (Ollama's `/v1`) and `-m` picks the model.
      return { env: {}, argsBefore: ['--oss', '-m', model] };
    case 'cline':
    case 'opencode':
      // Neither CLI takes a provider override on the command line — `ollama
      // launch` is the one tool that writes their config file and starts
      // them pointed at itself. `--` ends `launch`'s own flags so the agent's
      // usual interactive/headless args + prompt (appended by the caller)
      // are passed through untouched.
      return {
        env: {},
        argsBefore: ['launch', agentId, '--model', model, '--yes', '--'],
        commandOverride: 'ollama',
      };
    default:
      return null;
  }
}

/** What {@link resolveAgentLaunch} hands back — always fully formed, whether or not the binding was actually Ollama. */
export type ResolvedAgentLaunch = {
  command: string;
  argsBefore: string[];
  env: Record<string, string>;
  /** Echoes the binding this resolved from, so a caller can stamp session identity without re-deriving it. */
  backend: 'native' | 'ollama';
  model?: string;
};

/**
 * The ONE resolver every launch path calls — `start-agent.ts` (terminal and
 * cards, which is also every loop and companion launch, since they all go
 * through `startAgent`), `council-runner.ts`, and workflow `node-sessions.ts`
 * (via `executors/agent.ts`). Never re-derive this table at a call site.
 *
 * `command` is the agent's own roster `command` (e.g. `'claude'`) — this
 * never mutates the roster, it only says what to actually type/spawn for
 * *this* launch. A binding with no model, an unsupported agent, or
 * `backend: 'native'` all resolve identically: the agent's own command, no
 * extra args, no extra env — so a caller never has to special-case "not
 * bound" separately from "bound but empty".
 */
export function resolveAgentLaunch(
  agent: { id: string; command: string },
  binding: AgentOllamaBinding | undefined,
  base: string,
  authToken?: string,
): ResolvedAgentLaunch {
  if (binding?.backend !== 'ollama' || !binding.model) {
    return { command: agent.command, argsBefore: [], env: {}, backend: 'native' };
  }
  const recipe = ollamaLaunchRecipe(agent.id, binding.model, base, authToken);
  if (!recipe) {
    return { command: agent.command, argsBefore: [], env: {}, backend: 'native' };
  }
  return {
    command: recipe.commandOverride ?? agent.command,
    argsBefore: recipe.argsBefore,
    env: recipe.env,
    backend: 'ollama',
    model: binding.model,
  };
}
