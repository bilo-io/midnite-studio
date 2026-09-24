import { describe, expect, it } from 'vitest';

import { AiPlanBlueprintSchema, parsePlanBlueprintReply } from './ai-plan-blueprint';

const VALID = {
  project: { title: 'Ship the thing', description: 'A short plan.' },
  tasks: [
    { key: 'api', title: 'Build the API', body: '', labels: [] },
    { key: 'ui', title: 'Wire up the UI', body: 'Do the thing', labels: ['frontend'] },
  ],
  edges: [{ from: 'ui', to: 'api', kind: 'blockedBy' }],
};

describe('AiPlanBlueprintSchema', () => {
  it('accepts a well-formed blueprint', () => {
    expect(AiPlanBlueprintSchema.safeParse(VALID).success).toBe(true);
  });

  it('defaults an omitted description/body/labels/edges', () => {
    const parsed = AiPlanBlueprintSchema.parse({
      project: { title: 'X' },
      tasks: [{ key: 'a', title: 'A' }],
    });
    expect(parsed.project.description).toBe('');
    expect(parsed.tasks[0]?.body).toBe('');
    expect(parsed.tasks[0]?.labels).toEqual([]);
    expect(parsed.edges).toEqual([]);
  });

  it('rejects a duplicate task key', () => {
    const result = AiPlanBlueprintSchema.safeParse({
      ...VALID,
      tasks: [...VALID.tasks, { key: 'api', title: 'A second one', body: '', labels: [] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an edge naming a task key that does not exist', () => {
    const result = AiPlanBlueprintSchema.safeParse({
      ...VALID,
      edges: [{ from: 'ui', to: 'ghost', kind: 'blockedBy' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a task blocking itself', () => {
    const result = AiPlanBlueprintSchema.safeParse({
      ...VALID,
      edges: [{ from: 'api', to: 'api', kind: 'blockedBy' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a plan with no tasks', () => {
    const result = AiPlanBlueprintSchema.safeParse({ ...VALID, tasks: [] });
    expect(result.success).toBe(false);
  });

  it('rejects an empty project title', () => {
    const result = AiPlanBlueprintSchema.safeParse({ ...VALID, project: { title: '' } });
    expect(result.success).toBe(false);
  });
});

describe('parsePlanBlueprintReply', () => {
  it('parses a bare JSON reply', () => {
    expect(parsePlanBlueprintReply(JSON.stringify(VALID))).toEqual(VALID);
  });

  it('recovers a blueprint fenced in a markdown code block', () => {
    const stdout = `Here you go:\n\`\`\`json\n${JSON.stringify(VALID)}\n\`\`\`\nLet me know if that works.`;
    expect(parsePlanBlueprintReply(stdout)).toEqual(VALID);
  });

  it('ignores trailing prose containing a stray brace', () => {
    const stdout = `${JSON.stringify(VALID)} and then a stray } appeared`;
    expect(parsePlanBlueprintReply(stdout)).toEqual(VALID);
  });

  it('returns null for prose with no JSON at all', () => {
    expect(parsePlanBlueprintReply('I am afraid I cannot do that.')).toBeNull();
  });

  it('returns null for unbalanced/invalid JSON', () => {
    expect(parsePlanBlueprintReply('{not json at all')).toBeNull();
  });

  it('returns null for an empty reply', () => {
    expect(parsePlanBlueprintReply('')).toBeNull();
  });

  it('returns null for well-formed JSON that fails the schema', () => {
    expect(parsePlanBlueprintReply('{"answer":"wrong shape"}')).toBeNull();
  });
});
