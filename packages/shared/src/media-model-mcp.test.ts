import { describe, expect, it } from 'vitest';

import {
  agentIteratesModel,
  MODEL_ITERATIONS_MAX,
  MODEL_MAX_PARTS,
  MODEL_MCP_TOOL_IDS,
  MODEL_MCP_WRITE_TOOL_IDS,
  MODEL_PREVIEW_VIEWS,
  MODEL_SHAPES,
  ModelEditResultSchema,
  ModelGenerateRequestSchema,
  ModelPartSchema,
  ModelPatchPartsInputSchema,
  ModelRenderPreviewInputSchema,
  ModelSpecSchema,
} from './index';
import { MCP_TOOLS } from './mcp';

describe('model MCP contract', () => {
  it('derives MODEL_SHAPES from the part union, so a new kind appears by being added there', () => {
    expect(MODEL_SHAPES).toEqual(ModelPartSchema.options.map((o) => o.shape.shape.value));
    expect(MODEL_SHAPES).toContain('lathe');
  });

  it('has one part cap, shared by the schema', () => {
    const box = { shape: 'box', size: [1, 1, 1] };
    expect(ModelSpecSchema.safeParse({ parts: Array.from({ length: MODEL_MAX_PARTS }, () => box) }).success).toBe(true);
    expect(ModelSpecSchema.safeParse({ parts: Array.from({ length: MODEL_MAX_PARTS + 1 }, () => box) }).success).toBe(false);
  });

  it('accepts an optional part id without requiring one', () => {
    expect(ModelPartSchema.parse({ shape: 'sphere', radius: 1, id: 'a' }).id).toBe('a');
    expect(ModelPartSchema.parse({ shape: 'sphere', radius: 1 }).id).toBeUndefined();
  });

  it('registers exactly the model tool ids, and the write ones are the non-read-only ones', () => {
    const registered = Object.keys(MCP_TOOLS).filter((id) => id.startsWith('model_'));
    expect(registered.sort()).toEqual([...MODEL_MCP_TOOL_IDS].sort());
    expect(MODEL_MCP_WRITE_TOOL_IDS.slice().sort()).toEqual(MODEL_MCP_TOOL_IDS.filter((id) => !MCP_TOOLS[id].readOnly).sort());
  });

  it('keeps patch ops generic over part fields: an update takes any field, a new field needs no schema change', () => {
    const base = { repoPath: '/r', project: 'p', model: 'm.obj' };
    expect(
      ModelPatchPartsInputSchema.safeParse({ ...base, ops: [{ op: 'update', id: 'p1', fields: { someFutureMaterial: { roughness: 0.4 } } }] }).success,
    ).toBe(true);
    expect(ModelPatchPartsInputSchema.safeParse({ ...base, ops: [{ op: 'add', part: { shape: 'box' } }, { op: 'remove', id: 'p2' }] }).success).toBe(true);
    expect(ModelPatchPartsInputSchema.safeParse({ ...base, ops: [] }).success).toBe(false);
    expect(ModelPatchPartsInputSchema.safeParse({ ...base, ops: [{ op: 'explode' }] }).success).toBe(false);
  });

  it('bounds a preview request: known views only, size within limits', () => {
    const base = { repoPath: '/r', project: 'p', model: 'm.obj' };
    expect(ModelRenderPreviewInputSchema.safeParse({ ...base, views: [...MODEL_PREVIEW_VIEWS], size: 768 }).success).toBe(true);
    expect(ModelRenderPreviewInputSchema.safeParse({ ...base, size: 769 }).success).toBe(false);
    expect(ModelRenderPreviewInputSchema.safeParse({ ...base, size: 64 }).success).toBe(false);
    expect(ModelRenderPreviewInputSchema.safeParse({ ...base, views: ['bottom'] }).success).toBe(false);
  });

  it('models an edit result as applied or as structured errors', () => {
    expect(ModelEditResultSchema.safeParse({ ok: false, errors: [{ opIndex: 0, path: 'part.size', message: 'Required' }] }).success).toBe(true);
    expect(ModelEditResultSchema.safeParse({ ok: false }).success).toBe(false);
  });

  it('says which agents iterate, and bounds the iteration budget on a request', () => {
    expect(agentIteratesModel('claude')).toBe(true);
    expect(agentIteratesModel('codex')).toBe(true);
    expect(agentIteratesModel('cursor')).toBe(false);
    const base = { generationId: 'g', repoId: 'r', project: 'p', prompt: 'x', engine: { kind: 'agent', agentId: 'claude' } };
    expect(ModelGenerateRequestSchema.safeParse({ ...base, maxIterations: MODEL_ITERATIONS_MAX }).success).toBe(true);
    expect(ModelGenerateRequestSchema.safeParse({ ...base, maxIterations: MODEL_ITERATIONS_MAX + 1 }).success).toBe(false);
  });
});
