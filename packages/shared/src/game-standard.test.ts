// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  GAME_FIX_IDS,
  GAME_RULE_AREAS,
  GAME_RULE_IDS,
  GAME_RULES,
  GameFixIdSchema,
  GameRuleLevelSchema,
} from './game-standard';

const doc = readFileSync(resolve(__dirname, '../../../docs/GAME_STANDARD.md'), 'utf8');

describe('game standard', () => {
  it('has a complete rule for every id, with its area matching the id prefix', () => {
    expect(Object.keys(GAME_RULES).sort()).toEqual([...GAME_RULE_IDS].sort());
    for (const id of GAME_RULE_IDS) {
      const rule = GAME_RULES[id];
      expect(GameRuleLevelSchema.safeParse(rule.level).success).toBe(true);
      expect(GAME_RULE_AREAS).toContain(rule.area);
      expect(id.startsWith(`${rule.area}.`)).toBe(true);
      expect(rule.title && rule.unlocks && rule.fix).toBeTruthy();
    }
  });

  it("lists every rule id in docs/GAME_STANDARD.md's rule table, with its level", () => {
    for (const id of GAME_RULE_IDS) {
      const row = doc.split('\n').find((line) => line.startsWith(`| \`${id}\` |`));
      expect(row, id).toBeDefined();
      expect(row).toContain(`| ${GAME_RULES[id].level} |`);
    }
  });

  it('documents no rule id the code does not know', () => {
    const documented = [...doc.matchAll(/^\| `([a-z]+\.[a-z-]+)` \|/gm)].map((m) => m[1]);
    expect(documented.sort()).toEqual([...GAME_RULE_IDS].sort());
  });

  it('names the six safe fixes', () => {
    expect(GAME_FIX_IDS).toHaveLength(6);
    expect(GameFixIdSchema.safeParse('upgrade-kit').success).toBe(true);
    expect(GameFixIdSchema.safeParse('rm-rf').success).toBe(false);
  });
});
