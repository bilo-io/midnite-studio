import type { GitOpResult } from '@midnite/studio-shared';

/**
 * A vision-model call (Ollama's llava family in an app) — declared here from its shape because the Model
 * feature's engines own the real one and a feature may not import another. The composer passes its own;
 * it satisfies this structurally.
 */
export type VisionCall = (req: {
  images: string[];
  prompt: string;
  visionModel?: string;
  json?: boolean;
  signal?: AbortSignal;
}) => Promise<GitOpResult<{ text: string; model: string }>>;
