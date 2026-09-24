/**
 * Ollama (Phase 96 Theme B) — the wire contract for the local/cloud model
 * daemon. Every field here is camelCase, like every other domain module in
 * this package; Ollama's own REST API is snake_case
 * (`parent_model`, `modified_at`, `size_vram`, …), and the main-process
 * client (`desktop/src/main/ollama/client.ts`) is where that translation
 * happens — nothing in this file, or crossing the IPC boundary, ever carries
 * a raw Ollama field name.
 *
 * Every object schema below is tolerant on purpose: Ollama's wire shapes are
 * external and not fully under this app's control (a new `details` key, a
 * `status` string this app has never seen), so nothing here is a closed enum
 * over a field Ollama can freely extend, and the client only reads the
 * fields this app actually uses.
 */
import { z } from 'zod';

// --- shared `details` sub-object (list / show / ps all carry one) ----------

export const OllamaModelDetailsSchema = z.object({
  parentModel: z.string().optional(),
  format: z.string().optional(),
  family: z.string().optional(),
  families: z.array(z.string()).optional(),
  parameterSize: z.string().optional(),
  quantizationLevel: z.string().optional(),
});
export type OllamaModelDetails = z.infer<typeof OllamaModelDetailsSchema>;

// --- `/api/tags` — one installed model row ----------------------------------

export const OllamaModelSchema = z.object({
  name: z.string().min(1),
  model: z.string().min(1),
  /** ISO timestamp; `null` when Ollama omits it (seen on some cloud rows). */
  modifiedAt: z.string().nullable(),
  size: z.number().nonnegative(),
  digest: z.string(),
  details: OllamaModelDetailsSchema.optional(),
});
export type OllamaModel = z.infer<typeof OllamaModelSchema>;

// --- `/api/show` — one model's full detail ----------------------------------

/**
 * `contextLength` is never read off the wire directly — it is derived by
 * {@link deriveContextLength} from `modelInfo`'s `<arch>.context_length` key,
 * whose prefix varies per model family. `null` means the detail carried no
 * recognisable context-length key, not that context is unbounded.
 */
export const OllamaModelDetailSchema = z.object({
  modelfile: z.string().optional(),
  parameters: z.string().optional(),
  template: z.string().optional(),
  license: z.union([z.string(), z.array(z.string())]).optional(),
  details: OllamaModelDetailsSchema.optional(),
  modelInfo: z.record(z.string(), z.unknown()).optional(),
  capabilities: z.array(z.string()).optional(),
  contextLength: z.number().int().positive().nullable().optional(),
});
export type OllamaModelDetail = z.infer<typeof OllamaModelDetailSchema>;

/**
 * `GET /api/show`'s `model_info` is a flat record keyed
 * `"<arch>.context_length"` (`llama.context_length`, `qwen3.context_length`,
 * …) — the architecture prefix is the model family, not a fixed string, so
 * this scans for the first key matching the suffix rather than hard-coding
 * one architecture. Pure and unit-tested precisely because "which key" is
 * the one fact this whole feature hinges on (Theme G's fitness verdict).
 */
export function deriveContextLength(modelInfo: Record<string, unknown> | undefined): number | null {
  if (!modelInfo) return null;
  for (const [key, value] of Object.entries(modelInfo)) {
    if (!key.endsWith('.context_length')) continue;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

// --- `/api/ps` — one running model row --------------------------------------

export const OllamaRunningModelSchema = z.object({
  name: z.string().min(1),
  model: z.string().min(1),
  size: z.number().nonnegative(),
  digest: z.string(),
  details: OllamaModelDetailsSchema.optional(),
  /** ISO timestamp the model unloads at, absent when Ollama omits it. */
  expiresAt: z.string().nullable().optional(),
  sizeVram: z.number().nonnegative().optional(),
  contextLength: z.number().int().positive().optional(),
});
export type OllamaRunningModel = z.infer<typeof OllamaRunningModelSchema>;

// --- daemon status -----------------------------------------------------------

/**
 * Shared by the `ollamaStatus` IPC call and `SystemHealthResponse.ollamaDaemon`
 * (Theme A) — one shape for "is the daemon there", read via `GET
 * /api/version`. Unreachable is ordinary data (`reachable: false`), never a
 * thrown/`GitOpResult` failure — the Health page and the Models view both
 * need to render it as a normal state, not an error banner.
 */
export const OllamaDaemonStatusSchema = z.object({
  reachable: z.boolean(),
  version: z.string().nullable(),
  host: z.string(),
});
export type OllamaDaemonStatus = z.infer<typeof OllamaDaemonStatusSchema>;

// --- pull progress (streamed) ------------------------------------------------

/**
 * Pushed on `mstudio:ollama:pull-progress`, keyed by the `pullId` the
 * `ollamaPull` call returned. `status` is Ollama's own free-text progress
 * label (`"pulling manifest"`, `"downloading sha256:…"`, `"verifying sha256
 * digest"`, `"success"`, …) — never a closed enum, since Ollama adds new ones
 * without notice. `done` is set by the pull queue, not read off the wire.
 */
export const OllamaPullProgressEventSchema = z.object({
  pullId: z.string().min(1),
  model: z.string().min(1),
  status: z.string(),
  digest: z.string().optional(),
  total: z.number().nonnegative().optional(),
  completed: z.number().nonnegative().optional(),
  done: z.boolean().optional(),
});
export type OllamaPullProgressEvent = z.infer<typeof OllamaPullProgressEventSchema>;

// --- search (Theme D contract, declared here so naming is settled once) ----

/**
 * The shape Theme D's `ollama/library-search.ts` scraper will return — declared
 * now so downstream themes (C's Discover tab, E's detail modal) can build
 * against a settled type. No `mstudio:ollama:search` channel exists yet in
 * this PR; Theme D wires the channel and the handler that actually produces
 * this shape.
 */
export const OllamaSearchResultItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
  variants: z.array(z.string()).optional(),
  pulls: z.string().optional(),
  updatedAt: z.string().optional(),
  cloud: z.boolean().optional(),
});
export type OllamaSearchResultItem = z.infer<typeof OllamaSearchResultItemSchema>;

// --- settings (Theme C) -------------------------------------------------------

/**
 * The one piece of Ollama config Theme B explicitly left for this theme to
 * build: "no Settings ▸ Ollama page yet to read an override from." Persisted
 * in main (`desktop/src/main/ollama/settings-store.ts`), not the renderer, so
 * a configured host reaches every client call — `resolveOllamaBaseUrl`
 * (Theme B) stays a pure env-only function with its own unit tests intact;
 * `getConfiguredOllamaHost()` is consulted ahead of it.
 *
 * `defaultModel` has no consumer yet in this PR — it is read by later themes
 * (H's per-agent binding, I's headless-AI picker) as the pre-fill for "which
 * model" once they exist; storing it beside `host` now means those themes
 * don't need their own IPC round-trip for one string.
 */
export const OllamaSettingsSchema = z.object({
  host: z.string().nullable(),
  defaultModel: z.string().nullable(),
});
export type OllamaSettings = z.infer<typeof OllamaSettingsSchema>;

// --- fitness (Theme G) --------------------------------------------------------

/**
 * Ollama's own documented default context window when nothing overrides it
 * (`OLLAMA_CONTEXT_LENGTH`, unset) — see the phase doc's "Ollama facts". A
 * model that reports a much larger {@link OllamaModelDetail.contextLength}
 * (its architecture's own maximum) still *runs* at this size unless a
 * `num_ctx` parameter says otherwise, which is exactly the gap this theme
 * exists to surface and fix.
 */
export const OLLAMA_DEFAULT_CONTEXT_LENGTH = 4096;

/** Every agent CLI integration this phase targets asks for at least this
 *  much context (phase doc, "Ollama facts"). */
export const AGENT_MIN_CONTEXT_LENGTH = 65536;

/**
 * Extracts a `num_ctx` override from `/api/show`'s `parameters` field — a
 * plain-text block, one `PARAMETER` key/value pair per line (`"num_ctx
 * 65536\nstop  <|im_start|>"`, the same grammar a Modelfile writes and Ollama
 * echoes back verbatim). Returns `null` when no `num_ctx` line is present,
 * meaning the model runs at {@link OLLAMA_DEFAULT_CONTEXT_LENGTH}.
 */
export function deriveNumCtx(parameters: string | null | undefined): number | null {
  if (!parameters) return null;
  for (const line of parameters.split('\n')) {
    const match = /^\s*num_ctx\s+(\d+)\s*$/.exec(line);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

/**
 * The context length a model actually runs at — its own `num_ctx` override
 * when its Modelfile sets one, else Ollama's default. Distinct from
 * {@link OllamaModelDetail.contextLength} (that model's own architectural
 * maximum, from `model_info`), which can be far larger than what it is
 * actually served with — the exact distinction Theme E's stat grid shows
 * both halves of.
 */
export function effectiveContextLength(detail: Pick<OllamaModelDetail, 'parameters'>): number {
  return deriveNumCtx(detail.parameters) ?? OLLAMA_DEFAULT_CONTEXT_LENGTH;
}

export type AgentFitness = {
  fit: boolean;
  /** Human-readable, e.g. `"no tool calling"`, `"context 4096 — agents need
   *  64k"` — the phase doc's own wording, shown as-is in Theme E's verdict
   *  and (via Theme I, later) the agent/per-launch pickers. Empty when
   *  `fit`. */
  reasons: string[];
};

/**
 * Theme G — "is this model actually usable by an agent CLI". Pure and unit
 * tested: every agent integration this phase targets needs tool calling
 * (Ollama's own `capabilities` list) and at least {@link
 * AGENT_MIN_CONTEXT_LENGTH} of *effective* context — not the model's raw
 * maximum, which `effectiveCtx` (typically {@link effectiveContextLength}'s
 * result) already accounts for. A cloud model has no local `num_ctx` to
 * derive one from; per the phase doc's "cloud models count as fit by
 * default" decision, a caller for one passes a large sentinel unless its own
 * catalogue entry says otherwise — this function itself has no opinion on
 * local vs. cloud.
 */
export function agentFitness(
  detail: Pick<OllamaModelDetail, 'capabilities'>,
  effectiveCtx: number,
): AgentFitness {
  const reasons: string[] = [];
  if (!(detail.capabilities ?? []).includes('tools')) reasons.push('no tool calling');
  if (effectiveCtx < AGENT_MIN_CONTEXT_LENGTH) {
    reasons.push(`context ${effectiveCtx} — agents need 64k`);
  }
  return { fit: reasons.length === 0, reasons };
}
