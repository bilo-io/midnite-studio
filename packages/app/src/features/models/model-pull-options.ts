import type { OllamaSearchResultItem } from '@midnite/studio-shared';
import { toOllamaCloudModelName } from '@midnite/studio-shared';

export type PullModelOption = {
  /** Exact tag for `ollama pull` — `name:variant` or bare `name`. */
  model: string;
  /** Base model name from the search row (without variant). */
  baseName: string;
  /** Variant tag when present (`8b`, `70b`, …). */
  variant: string | null;
  description?: string;
  capabilities?: string[];
  installed: boolean;
};

/** Whether `model` is installed — bare `name` also matches Ollama's `name:latest`. */
export function isModelInstalled(model: string, installed: Set<string>): boolean {
  return installed.has(model) || (!model.includes(':') && installed.has(`${model}:latest`));
}

/**
 * Flatten ollama.com search hits into one selectable row per parameter variant
 * (`llama3.1:8b`, `llama3.1:70b`, …). Cloud rows carry the `:cloud` suffix the
 * local daemon expects.
 */
export function buildPullModelOptions(
  items: OllamaSearchResultItem[],
  installed: Set<string>,
): PullModelOption[] {
  const seen = new Set<string>();
  const options: PullModelOption[] = [];
  for (const item of items) {
    const variants =
      item.variants && item.variants.length > 0
        ? item.variants.map((v) => ({ variant: v, model: `${item.name}:${v}` }))
        : [{ variant: null as string | null, model: item.name }];
    for (const { variant, model: tagged } of variants) {
      const model = item.cloud ? toOllamaCloudModelName(tagged) : tagged;
      if (seen.has(model)) continue;
      seen.add(model);
      options.push({
        model,
        baseName: item.name,
        variant,
        description: item.description,
        capabilities: item.capabilities,
        installed: isModelInstalled(model, installed),
      });
    }
  }
  return options;
}

/** Case-sensitive match on the pull tag — what Ollama expects on the wire. */
export function findPullOption(options: PullModelOption[], model: string): PullModelOption | undefined {
  const trimmed = model.trim();
  if (!trimmed) return undefined;
  return options.find((option) => option.model === trimmed);
}
