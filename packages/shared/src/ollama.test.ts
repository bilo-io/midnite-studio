import { describe, expect, it } from 'vitest';

import {
  AGENT_MIN_CONTEXT_LENGTH,
  OLLAMA_DEFAULT_CONTEXT_LENGTH,
  OllamaDaemonStatusSchema,
  OllamaModelDetailSchema,
  OllamaModelSchema,
  OllamaPullProgressEventSchema,
  OllamaRunningModelSchema,
  OllamaSearchResultItemSchema,
  agentFitness,
  deriveContextLength,
  deriveEmbeddingLength,
  deriveNumCtx,
  effectiveContextLength,
} from './ollama';

describe('deriveContextLength', () => {
  it('reads the first "<arch>.context_length" key it finds', () => {
    expect(deriveContextLength({ 'llama.context_length': 4096, 'llama.embedding_length': 4096 })).toBe(
      4096,
    );
  });

  it('works for a non-llama architecture prefix', () => {
    expect(deriveContextLength({ 'qwen3.context_length': 65536 })).toBe(65536);
  });

  it('returns null when model_info is undefined', () => {
    expect(deriveContextLength(undefined)).toBeNull();
  });

  it('returns null when no key matches the suffix', () => {
    expect(deriveContextLength({ 'llama.embedding_length': 4096 })).toBeNull();
  });

  it('ignores a non-numeric or non-positive value', () => {
    expect(deriveContextLength({ 'llama.context_length': '4096' })).toBeNull();
    expect(deriveContextLength({ 'llama.context_length': 0 })).toBeNull();
    expect(deriveContextLength({ 'llama.context_length': -1 })).toBeNull();
  });
});

describe('deriveEmbeddingLength', () => {
  it('reads the first "<arch>.embedding_length" key it finds', () => {
    expect(deriveEmbeddingLength({ 'llama.embedding_length': 4096 })).toBe(4096);
  });

  it('returns null when model_info is undefined or has no embedding key', () => {
    expect(deriveEmbeddingLength(undefined)).toBeNull();
    expect(deriveEmbeddingLength({ 'llama.context_length': 4096 })).toBeNull();
  });
});

describe('OllamaModelSchema', () => {
  it('parses a minimal tags row', () => {
    const result = OllamaModelSchema.safeParse({
      name: 'qwen3.5:14b',
      model: 'qwen3.5:14b',
      modifiedAt: '2026-09-24T00:00:00Z',
      size: 123,
      digest: 'sha256:abc',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a null modifiedAt', () => {
    const result = OllamaModelSchema.safeParse({
      name: 'qwen3.5:14b',
      model: 'qwen3.5:14b',
      modifiedAt: null,
      size: 123,
      digest: 'sha256:abc',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a row missing a required field', () => {
    const result = OllamaModelSchema.safeParse({ name: 'qwen3.5:14b' });
    expect(result.success).toBe(false);
  });
});

describe('OllamaModelDetailSchema', () => {
  it('parses a show response with a derived contextLength', () => {
    const result = OllamaModelDetailSchema.safeParse({
      modelfile: 'FROM qwen3.5:14b',
      capabilities: ['completion', 'tools'],
      modelInfo: { 'qwen3.context_length': 65536 },
      contextLength: 65536,
    });
    expect(result.success).toBe(true);
  });

  it('accepts license as a single string or an array', () => {
    expect(OllamaModelDetailSchema.safeParse({ license: 'MIT' }).success).toBe(true);
    expect(OllamaModelDetailSchema.safeParse({ license: ['MIT', 'Apache-2.0'] }).success).toBe(true);
  });
});

describe('OllamaRunningModelSchema', () => {
  it('parses a ps row', () => {
    const result = OllamaRunningModelSchema.safeParse({
      name: 'qwen3.5:14b',
      model: 'qwen3.5:14b',
      size: 123,
      digest: 'sha256:abc',
      expiresAt: '2026-09-24T01:00:00Z',
      sizeVram: 456,
      contextLength: 65536,
    });
    expect(result.success).toBe(true);
  });
});

describe('OllamaDaemonStatusSchema', () => {
  it('parses an unreachable status as ordinary data', () => {
    const result = OllamaDaemonStatusSchema.safeParse({
      reachable: false,
      version: null,
      host: 'http://127.0.0.1:11434',
    });
    expect(result.success).toBe(true);
  });
});

describe('OllamaPullProgressEventSchema', () => {
  it('parses a mid-pull progress event', () => {
    const result = OllamaPullProgressEventSchema.safeParse({
      pullId: 'p1',
      model: 'qwen3.5:14b',
      status: 'downloading sha256:abc',
      digest: 'sha256:abc',
      total: 1000,
      completed: 500,
    });
    expect(result.success).toBe(true);
  });

  it('parses a terminal event with no byte counts', () => {
    const result = OllamaPullProgressEventSchema.safeParse({
      pullId: 'p1',
      model: 'qwen3.5:14b',
      status: 'success',
      done: true,
    });
    expect(result.success).toBe(true);
  });
});

describe('OllamaSearchResultItemSchema', () => {
  it('parses a minimal search result', () => {
    const result = OllamaSearchResultItemSchema.safeParse({ name: 'qwen3.5' });
    expect(result.success).toBe(true);
  });
});

describe('deriveNumCtx', () => {
  it('reads a num_ctx line out of a parameters block', () => {
    expect(deriveNumCtx('num_ctx                        65536\nstop  "<|im_start|>"')).toBe(65536);
  });

  it('reads num_ctx regardless of position in the block', () => {
    expect(deriveNumCtx('stop  "<|im_start|>"\nnum_ctx 4096\ntemperature 0.7')).toBe(4096);
  });

  it('returns null when there is no num_ctx line', () => {
    expect(deriveNumCtx('stop  "<|im_start|>"\ntemperature 0.7')).toBeNull();
  });

  it('returns null for empty/undefined/null input', () => {
    expect(deriveNumCtx('')).toBeNull();
    expect(deriveNumCtx(undefined)).toBeNull();
    expect(deriveNumCtx(null)).toBeNull();
  });

  it('ignores a non-numeric or non-positive value', () => {
    expect(deriveNumCtx('num_ctx not-a-number')).toBeNull();
    expect(deriveNumCtx('num_ctx 0')).toBeNull();
  });
});

describe('effectiveContextLength', () => {
  it('uses the num_ctx override when the parameters set one', () => {
    expect(effectiveContextLength({ parameters: 'num_ctx 65536' })).toBe(65536);
  });

  it('falls back to the Ollama default with no override', () => {
    expect(effectiveContextLength({ parameters: undefined })).toBe(OLLAMA_DEFAULT_CONTEXT_LENGTH);
    expect(effectiveContextLength({ parameters: 'stop "<|im_start|>"' })).toBe(
      OLLAMA_DEFAULT_CONTEXT_LENGTH,
    );
  });
});

describe('agentFitness', () => {
  it('is fit when tools are supported and effective context clears the bar', () => {
    const result = agentFitness({ capabilities: ['completion', 'tools'] }, AGENT_MIN_CONTEXT_LENGTH);
    expect(result).toEqual({ fit: true, reasons: [] });
  });

  it('flags missing tool calling', () => {
    const result = agentFitness({ capabilities: ['completion'] }, AGENT_MIN_CONTEXT_LENGTH);
    expect(result.fit).toBe(false);
    expect(result.reasons).toContain('no tool calling');
  });

  it('flags a context under the 64k bar, with the phase doc wording', () => {
    const result = agentFitness(
      { capabilities: ['completion', 'tools'] },
      OLLAMA_DEFAULT_CONTEXT_LENGTH,
    );
    expect(result.fit).toBe(false);
    expect(result.reasons).toEqual(['context 4096 — agents need 64k']);
  });

  it('can flag both reasons at once', () => {
    const result = agentFitness({ capabilities: [] }, OLLAMA_DEFAULT_CONTEXT_LENGTH);
    expect(result.fit).toBe(false);
    expect(result.reasons).toEqual(['no tool calling', 'context 4096 — agents need 64k']);
  });

  it('treats an undefined capabilities list as no tools', () => {
    const result = agentFitness({}, AGENT_MIN_CONTEXT_LENGTH);
    expect(result.reasons).toContain('no tool calling');
  });
});
