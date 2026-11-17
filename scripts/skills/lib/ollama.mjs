// Ollama router for the skill scripts (Phase 151 Theme A). Ollama is strictly optional: every call
// takes a deterministic `fallback()` and uses it when the daemon is off, the model is not pulled,
// the call fails, or `--no-llm` / `MSTUDIO_NO_LLM=1` is set. Nothing here throws on an LLM problem.

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
export const LONG_PROMPT_CHARS = 8000;

/** Preferred models per task kind, best first. `draft`/`audit` switch to the 64k model on long prompts. */
export const MODELS = {
  classify: ['gemma4:e2b', 'ministral-3:3b'],
  note: ['gemma4:e2b', 'ministral-3:3b'],
  draft: ['qwen3.5:9b'],
  audit: ['qwen3.5:9b'],
};
export const LONG_MODEL = 'qwen3.5:9b-64k';

export const ollamaUrl = (env = process.env) => (env.MSTUDIO_OLLAMA_URL || DEFAULT_OLLAMA_URL).replace(/\/+$/, '');

/** True when the caller opted out: `--no-llm` in argv or MSTUDIO_NO_LLM=1/true. */
export const isNoLlm = (argv = process.argv, env = process.env) =>
  argv.includes('--no-llm') || ['1', 'true'].includes(String(env.MSTUDIO_NO_LLM ?? '').toLowerCase());

/** Candidate model names for a task and prompt length. Throws on an unknown task (a caller bug). */
export function routeModels(task, promptLength = 0) {
  const base = MODELS[task];
  if (!base) throw new Error(`ollama: unknown task "${task}" (expected ${Object.keys(MODELS).join('|')})`);
  if ((task === 'draft' || task === 'audit') && promptLength > LONG_PROMPT_CHARS) return [LONG_MODEL, ...base];
  return [...base];
}

const withTimeout = async (fetchImpl, url, init, timeoutMs) => {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
};

/** Probe `/api/tags`. Resolves `{up:false}` on any failure, `{up:true, models:[names]}` otherwise. */
export async function probe({ fetch: fetchImpl = globalThis.fetch, url = ollamaUrl(), timeoutMs = 800 } = {}) {
  try {
    const res = await withTimeout(fetchImpl, `${url}/api/tags`, {}, timeoutMs);
    if (!res.ok) return { up: false, models: [] };
    const body = await res.json();
    return { up: true, models: (body.models ?? []).map((m) => m.name ?? m.model).filter(Boolean) };
  } catch {
    return { up: false, models: [] };
  }
}

/**
 * Run a task through Ollama, or the fallback.
 * @param {{task:'classify'|'note'|'draft'|'audit', prompt:string, system?:string, fallback:()=>any,
 *   noLlm?:boolean, fetch?:typeof fetch, url?:string, timeoutMs?:number, probeTimeoutMs?:number}} opts
 * @returns {Promise<{source:'ollama'|'fallback', model:string|null, text:any, reason?:string}>}
 *   `text` is the model's reply (string) or whatever `fallback()` returned.
 */
export async function run(opts) {
  const { task, prompt, system, fallback, noLlm = isNoLlm(), fetch: fetchImpl = globalThis.fetch } = opts;
  const url = opts.url ?? ollamaUrl();
  const fall = async (reason) => ({ source: 'fallback', model: null, text: await fallback(), reason });
  const candidates = routeModels(task, prompt.length);
  if (noLlm) return fall('no-llm');
  const { up, models } = await probe({ fetch: fetchImpl, url, timeoutMs: opts.probeTimeoutMs });
  if (!up) return fall('unreachable');
  const model = candidates.find((c) => models.includes(c));
  if (!model) return fall('model-missing');
  try {
    const res = await withTimeout(
      fetchImpl,
      `${url}/api/generate`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, prompt, ...(system ? { system } : {}), stream: false, options: { temperature: 0 } }),
      },
      opts.timeoutMs ?? 120_000,
    );
    if (!res.ok) return fall(`http-${res.status}`);
    const body = await res.json();
    const text = String(body.response ?? '').trim();
    if (!text) return fall('empty');
    return { source: 'ollama', model, text };
  } catch {
    return fall('error');
  }
}
