import { LuCircle } from 'react-icons/lu';
import { describe, expect, it } from 'vitest';

import { AGENT_BLUEPRINT_STAGES } from '@midnite/studio-shared';

import { BLUEPRINT_ICONS, optionIcon, STAGE_ICONS } from './blueprint-icons';

describe('blueprint icons', () => {
  it('has a glyph for every stage', () => {
    for (const stage of AGENT_BLUEPRINT_STAGES) expect(STAGE_ICONS[stage.id], stage.id).toBeDefined();
  });
  it('has its own glyph (not the fallback) for every option', () => {
    for (const stage of AGENT_BLUEPRINT_STAGES)
      for (const option of stage.options) {
        expect(optionIcon(option.id), option.id).not.toBe(LuCircle);
        expect(BLUEPRINT_ICONS[option.id], option.id).toBeDefined();
      }
  });
});
