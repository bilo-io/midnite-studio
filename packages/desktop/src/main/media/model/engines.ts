import {
  failure,
  MODEL_SUGGESTED_VISION,
  modelPullHint,
  ok,
  type GitOpResult,
  type LoopModel,
  type ModelProviders,
} from '@midnite/studio-shared';

import type { OllamaChatMessage } from '../../ollama/client';
import { DESCRIBE_IMAGE_PROMPT } from './prompts';
import type { DescribeImageCall, LlmCall } from './model-service';

/**
 * The LLM seams behind Media ▸ Models — Ollama for the local/free default
 * (JSON-constrained decoding for the spec, a vision model for the picture)
 * and the roster's headless agent CLIs as the alternative, the same two
 * routes Docs' Ask AI uses. Everything reaches Ollama through injected
 * functions, so the daemon-down and no-model paths are plain unit tests.
 */

/** A 7B model writing ~2k tokens of JSON on a laptop is minutes, not seconds. */
export const MODEL_LLM_TIMEOUT_MS = 8 * 60_000;
export const MODEL_VISION_TIMEOUT_MS = 4 * 60_000;

export type OllamaSeam = {
  chat: (
    req: { model: string; messages: OllamaChatMessage[]; format?: 'json'; options?: Record<string, number> },
    opts: { timeoutMs: number; signal: AbortSignal },
  ) => Promise<string>;
  tags: () => Promise<{ name: string }[]>;
  /** Capabilities from `/api/show`, e.g. `['completion', 'vision']`. */
  capabilities: (model: string) => Promise<string[]>;
};

export type EngineDeps = {
  ollama: OllamaSeam;
  /** Runs one prompt through a headless agent CLI — `runHeadlessText` in main. */
  runAgent: (req: { agentId: string; model: LoopModel | undefined; repoId: string; prompt: string }) => Promise<GitOpResult<{ text: string }>>;
};

const unreachable = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return /abort|cancel/i.test(message)
    ? 'cancelled'
    : /timed? ?out/i.test(message)
      ? 'The model took too long to answer. Try a smaller model, or a simpler description.'
      : `Could not reach Ollama: ${message}. Start it with \`ollama serve\`, or pick an agent as the engine.`;
};

export function createLlmCall(deps: EngineDeps): LlmCall {
  return async ({ engine, repoId, prompt, signal, json }) => {
    if (engine.kind === 'agent') {
      return deps.runAgent({ agentId: engine.agentId, model: engine.model, repoId, prompt });
    }
    try {
      const text = await deps.ollama.chat(
        {
          model: engine.model,
          messages: [{ role: 'user', content: prompt }],
          ...(json ? { format: 'json' as const } : {}),
          options: { temperature: 0.3, num_ctx: 8192 },
        },
        { timeoutMs: MODEL_LLM_TIMEOUT_MS, signal },
      );
      return text.trim() ? ok({ text }) : failure(`${engine.model} answered with nothing.`);
    } catch (error) {
      return failure(unreachable(error));
    }
  };
}

const VISION_MISSING =
  `No Ollama vision model is installed, so the picture cannot be read. ` +
  `Run \`${modelPullHint(MODEL_SUGGESTED_VISION[0]!.id)}\` (about ${MODEL_SUGGESTED_VISION[0]!.downloadGb} GB), ` +
  `or the lighter \`${modelPullHint(MODEL_SUGGESTED_VISION[1]!.id)}\`, then try again.`;

/** The installed vision models, suggested ones first. */
export async function discoverVisionModels(ollama: OllamaSeam): Promise<string[]> {
  const tags = await ollama.tags();
  const flags = await Promise.all(
    tags.map(async (tag) => ({ name: tag.name, vision: (await ollama.capabilities(tag.name).catch((): string[] => [])).includes('vision') })),
  );
  const names = flags.filter((f) => f.vision).map((f) => f.name);
  const rank = (name: string): number => {
    const index = MODEL_SUGGESTED_VISION.findIndex((s) => s.id === name);
    return index < 0 ? MODEL_SUGGESTED_VISION.length : index;
  };
  return [...names].sort((a, b) => rank(a) - rank(b));
}

export function createDescribeImage(deps: EngineDeps): DescribeImageCall {
  return async ({ image, visionModel, signal }) => {
    let model = visionModel;
    if (!model) {
      try {
        model = (await discoverVisionModels(deps.ollama))[0];
      } catch (error) {
        return failure(unreachable(error));
      }
      if (!model) return failure(VISION_MISSING);
    }
    try {
      const text = await deps.ollama.chat(
        { model, messages: [{ role: 'user', content: DESCRIBE_IMAGE_PROMPT, images: [image.data] }], options: { temperature: 0.2 } },
        { timeoutMs: MODEL_VISION_TIMEOUT_MS, signal },
      );
      return text.trim() ? ok({ text: text.trim(), model }) : failure(`${model} could not describe the image.`);
    } catch (error) {
      const message = unreachable(error);
      return failure(
        /not found|404/i.test(message) ? `${model} is not installed. Run \`${modelPullHint(model)}\` first.` : message,
      );
    }
  };
}

/** What the engine picker needs: whether Ollama answers, and what is installed. */
export async function probeProviders(ollama: OllamaSeam): Promise<ModelProviders> {
  let tags: { name: string }[];
  try {
    tags = await ollama.tags();
  } catch {
    return {
      ollama: {
        available: false,
        reason: 'Ollama is not running. Start it with `ollama serve`, or pick an agent as the engine.',
        models: [],
      },
    };
  }
  const models = await Promise.all(
    tags.map(async (tag) => {
      const caps = await ollama.capabilities(tag.name).catch(() => [] as string[]);
      return {
        id: tag.name,
        label: tag.name,
        vision: caps.includes('vision'),
        // `/api/show` lists `embedding` alone for embedding-only models.
        embedding: caps.includes('embedding') && !caps.includes('completion'),
      };
    }),
  );
  return { ollama: { available: true, models } };
}
