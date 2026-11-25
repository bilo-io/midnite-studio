import { describe, expect, it } from 'vitest';

import { AGENT_LIMIT_KEYS } from '@midnite/studio-shared';

import { FIELD_INFO, FIELD_INFO_MAX, type FieldId } from './info-copy';

const REQUIRED: FieldId[] = [
  'name',
  'description',
  'accent',
  'icon',
  'baseAgent',
  'model',
  'systemPrompt',
  'restrictTools',
  'mcpTools',
  'skills',
  ...AGENT_LIMIT_KEYS,
  'blueprint',
];

describe('FIELD_INFO', () => {
  it('has copy for every field, and nothing else', () => {
    expect(Object.keys(FIELD_INFO).sort()).toEqual([...REQUIRED].sort());
  });
  it('keeps each tip non-empty and at most 220 characters', () => {
    for (const id of REQUIRED) {
      expect(FIELD_INFO[id].trim().length, id).toBeGreaterThan(0);
      expect(FIELD_INFO[id].length, id).toBeLessThanOrEqual(FIELD_INFO_MAX);
    }
  });
});
