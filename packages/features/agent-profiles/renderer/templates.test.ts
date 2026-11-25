import { describe, expect, it } from 'vitest';

import { AgentProfileSchema, createBlankAgentProfile } from '@midnite/studio-shared';

import { AGENT_PROFILE_TEMPLATES } from './templates';

describe('AGENT_PROFILE_TEMPLATES', () => {
  it('offers reviewer, researcher and builder', () => {
    expect(AGENT_PROFILE_TEMPLATES.map((t) => t.id)).toEqual(['reviewer', 'researcher', 'builder']);
  });

  for (const template of AGENT_PROFILE_TEMPLATES) {
    it(`${template.id} applies to a blank profile and still parses`, () => {
      const result = template.apply(createBlankAgentProfile());
      expect(AgentProfileSchema.safeParse(result).success).toBe(true);
      expect(result.mcpTools).toBeNull();
      expect(result.systemPrompt.length).toBeGreaterThan(40);
    });
  }
});
