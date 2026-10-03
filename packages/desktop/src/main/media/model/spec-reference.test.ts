import { MODEL_MAX_PARTS, MODEL_SHAPES } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { buildIterativePrompt, SPEC_RULES } from './prompts';
import { modelSpecJsonSchema, modelSpecReference } from './spec-reference';

describe('schema-derived reference', () => {
  it('lists every shape of the shared union with its own fields — nothing hand-listed', () => {
    const reference = modelSpecReference();
    for (const shape of MODEL_SHAPES) expect(reference, shape).toContain(`"${shape}":`);
    expect(reference).toContain('"radiusTop"');
    expect(reference).toContain('"profile"');
    expect(reference).toContain('"outline"');
    expect(reference).toContain(`1 to ${MODEL_MAX_PARTS} parts`);
  });

  it('describes the common fields once, including the id handle model_patch_parts uses', () => {
    const reference = modelSpecReference();
    expect(reference).toMatch(/- "id": string \(optional\)/);
    expect(reference).toMatch(/- "color": "#rrggbb"/);
    expect(reference).toMatch(/- "position": \[number, number, number\]/);
  });

  it('exposes the full JSON schema for the design, with every part shape inlined', () => {
    const schema = modelSpecJsonSchema() as { properties: { parts: { items: { anyOf: unknown[] } } } };
    expect(schema.properties.parts.items.anyOf).toHaveLength(MODEL_SHAPES.length);
  });

  it('feeds the one-shot prompt and the iterative prompt from the same source', () => {
    expect(SPEC_RULES).toContain(modelSpecReference());
    const prompt = buildIterativePrompt({
      prompt: 'a chair',
      hasReference: true,
      target: { repoPath: '/r', project: 'p', model: 'chair.obj' },
      maxIterations: 4,
    });
    expect(prompt).toContain('"model":"chair.obj"');
    expect(prompt).toContain('4 render passes');
    expect(prompt).toContain('model_get_reference_image');
    expect(prompt).toContain('model_save');
    expect(prompt).toContain(String(MODEL_MAX_PARTS));
    // The format is fetched, not pasted: the prompt carries no copy of it to go stale.
    expect(prompt).not.toContain('"radiusTop"');
  });

  it('leaves the reference-picture step out when there is no picture', () => {
    const prompt = buildIterativePrompt({ prompt: 'a chair', hasReference: false, target: { repoPath: '/r', project: 'p', model: 'c.obj' }, maxIterations: 3 });
    expect(prompt).not.toContain('model_get_reference_image');
  });

  it('derives the new kinds, booleans, materials and the modifier stack from the schema', () => {
    const text = modelSpecReference();
    for (const word of ['"capsule"', '"roundedBox"', '"tube"', '"loft"', '"mesh"', '"group"', '"instance"', '"parent"', '"op"', '"target"', '"material"', 'Modifiers']) {
      expect(text).toContain(word);
    }
    for (const type of ['bevel', 'subdivide', 'mirror', 'array', 'radialArray', 'twist', 'taper', 'bend']) expect(text).toContain(`- "${type}":`);
    expect(text).toContain('"subtract"');
    expect(text).toContain('metalness');
  });
});
