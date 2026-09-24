import { describe, expect, it } from 'vitest';

import {
  OllamaDaemonStatusSchema,
  OllamaModelDetailSchema,
  OllamaModelSchema,
  OllamaPullProgressEventSchema,
  OllamaRunningModelSchema,
  OllamaSearchResultItemSchema,
  deriveContextLength,
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
