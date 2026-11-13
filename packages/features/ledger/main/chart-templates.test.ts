// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { LEDGER_ENTITIES, LedgerAccountSchema } from '@midnite/studio-shared';

import { CHART_TEMPLATES } from './chart-templates';

describe('CHART_TEMPLATES', () => {
  for (const entity of LEDGER_ENTITIES) {
    it(`${entity}: every account parses and codes are unique`, () => {
      const accounts = CHART_TEMPLATES[entity];
      for (const a of accounts) expect(LedgerAccountSchema.safeParse({ ...a, id: crypto.randomUUID() }).success, a.name).toBe(true);
      expect(new Set(accounts.map((a) => a.code)).size).toBe(accounts.length);
    });
  }

  it('sole-trader and company have exactly one retained-earnings account; personal needs none', () => {
    const count = (e: (typeof LEDGER_ENTITIES)[number]): number => CHART_TEMPLATES[e].filter((a) => a.subtype === 'retained-earnings').length;
    expect(count('sole-trader')).toBe(1);
    expect(count('company')).toBe(1);
    expect(count('personal')).toBe(0);
  });

  it('marks only entertainment as disallowable', () => {
    expect(CHART_TEMPLATES['sole-trader'].filter((a) => a.taxTreatment === 'disallowable').map((a) => a.name)).toEqual(['Entertainment']);
  });

  it('company swaps owner capital for share capital and drops drawings', () => {
    const names = CHART_TEMPLATES.company.map((a) => a.name);
    expect(names).toContain('Share capital');
    expect(names).not.toContain('Drawings');
    expect(names).not.toContain("Owner's capital");
  });
});
