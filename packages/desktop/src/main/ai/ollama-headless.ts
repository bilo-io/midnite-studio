import { ollamaChat, resolveOllamaBaseUrl } from '../ollama/client';
import { getConfiguredOllamaHost } from '../ollama/settings-service';

/**
 * The wand's and Plan with AI's Ollama path (Phase 96 Theme I) — one prompt,
 * one `/api/chat` call, no CLI. Shaped like `plan-blueprint.ts`'s own
 * `runOnce` result so both callers keep their existing timeout-message and
 * retry logic unchanged; only where the text comes from differs.
 */
export type OllamaHeadlessDeps = {
  /** Injected so a test can answer with fixed text or a thrown error. */
  chat?: typeof ollamaChat | undefined;
  /** Injected so a test never reads the persisted host override. */
  baseUrl?: (() => Promise<string>) | undefined;
};

async function defaultBaseUrl(): Promise<string> {
  return (await getConfiguredOllamaHost()) ?? resolveOllamaBaseUrl();
}

export async function runOllamaPrompt(
  model: string,
  prompt: string,
  timeoutMs: number,
  deps: OllamaHeadlessDeps = {},
): Promise<{ ok: true; data: string } | { ok: false; message: string }> {
  try {
    const baseUrl = await (deps.baseUrl ?? defaultBaseUrl)();
    const data = await (deps.chat ?? ollamaChat)(
      { model, messages: [{ role: 'user', content: prompt }] },
      { baseUrl, timeoutMs },
    );
    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: /abort|timed? ?out/i.test(message)
        ? 'That took too long, so the request was cancelled.'
        : `Could not reach Ollama (${model}): ${message}`,
    };
  }
}
