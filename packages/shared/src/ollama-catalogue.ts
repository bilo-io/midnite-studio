/**
 * The curated model list the setup wizard offers (Phase 98 Theme I) — static
 * data, reviewed each release, never fetched. The Models view's Discover tab
 * (Phase 96) is the open-ended path; this is the short list for a first run.
 *
 * `sizeBytes` is the download size of Ollama's default quantisation, rounded;
 * `minRamGb` is the smallest Mac memory the model runs on comfortably.
 */
import { z } from 'zod';

export const OLLAMA_CATALOGUE_TIERS = ['small', 'coder', 'reasoning'] as const;
export const OllamaCatalogueTierSchema = z.enum(OLLAMA_CATALOGUE_TIERS);
export type OllamaCatalogueTier = z.infer<typeof OllamaCatalogueTierSchema>;

export const OllamaCatalogueModelSchema = z.object({
  tag: z.string().regex(/^[a-z0-9][a-z0-9._-]*(:[a-z0-9._-]+)?$/),
  label: z.string().min(1),
  tier: OllamaCatalogueTierSchema,
  sizeBytes: z.number().int().positive(),
  minRamGb: z.number().int().positive(),
  blurb: z.string().min(1),
});
export type OllamaCatalogueModel = z.infer<typeof OllamaCatalogueModelSchema>;

const GB = 1_000_000_000;

export const OLLAMA_CATALOGUE: readonly OllamaCatalogueModel[] = [
  { tag: 'llama3.2:3b', label: 'Llama 3.2 3B', tier: 'small', sizeBytes: 2.0 * GB, minRamGb: 8, blurb: 'Fast general chat and summaries.' },
  { tag: 'gemma3:4b', label: 'Gemma 3 4B', tier: 'small', sizeBytes: 3.3 * GB, minRamGb: 8, blurb: 'Small, capable all-rounder from Google.' },
  { tag: 'qwen2.5-coder:7b', label: 'Qwen2.5 Coder 7B', tier: 'coder', sizeBytes: 4.7 * GB, minRamGb: 16, blurb: 'Code completion and edits.' },
  { tag: 'qwen2.5-coder:14b', label: 'Qwen2.5 Coder 14B', tier: 'coder', sizeBytes: 9.0 * GB, minRamGb: 32, blurb: 'Stronger code model for bigger Macs.' },
  { tag: 'deepseek-r1:8b', label: 'DeepSeek R1 8B', tier: 'reasoning', sizeBytes: 5.2 * GB, minRamGb: 16, blurb: 'Step-by-step reasoning.' },
  { tag: 'qwen3:14b', label: 'Qwen3 14B', tier: 'reasoning', sizeBytes: 9.3 * GB, minRamGb: 24, blurb: 'Reasoning with tool use.' },
];

export type OllamaRamFit = 'fits' | 'tight' | 'too-big';

/**
 * How a model sits against this Mac's memory: `fits` at or above `minRamGb`,
 * `tight` down to three quarters of it (it runs, but swaps under load), else
 * `too-big`. Memory is read in GiB, since that is what a Mac is sold by.
 */
export function ollamaRamFit(totalBytes: number, minRamGb: number): OllamaRamFit {
  const totalGb = totalBytes / 2 ** 30;
  if (totalGb >= minRamGb) return 'fits';
  if (totalGb >= minRamGb * 0.75) return 'tight';
  return 'too-big';
}
