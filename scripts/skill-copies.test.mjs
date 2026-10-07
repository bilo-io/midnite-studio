// The `midnite-media-*` skills ship as six copies — the repo's own `.claude`, `.agents` and `.codex`
// and the same three under `templates/midnite/` — and a drifting copy means an agent in one CLI is
// told something another is not. This pins every copy of each skill to the `.claude` one.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const COPIES = ['.claude', '.agents', '.codex', 'templates/midnite/.claude', 'templates/midnite/.agents', 'templates/midnite/.codex'];
const skills = readdirSync(join(root, '.claude', 'skills')).filter((name) => /^midnite-media-.+-build$/.test(name));

describe('midnite-media-*-build skill copies', () => {
  it('finds the build skills, the terrain one among them', () => {
    expect(skills).toContain('midnite-media-terrain-build');
    expect(skills).toContain('midnite-media-model-build');
    expect(skills).toContain('midnite-media-game-build');
  });

  // The game build skill is also seeded into every game repo from templates/media-game/skills/
  // (Phase 107 Theme L), which is its source of truth.
  it('midnite-media-game-build matches its game-repo template source', () => {
    const reference = readFileSync(join(root, '.claude', 'skills', 'midnite-media-game-build', 'SKILL.md'));
    const source = join(root, 'templates', 'media-game', 'skills', 'midnite-media-game-build', 'SKILL.md');
    expect(readFileSync(source).equals(reference), 'templates/media-game/skills copy differs from .claude').toBe(true);
  });

  for (const skill of skills) {
    it(`${skill} is byte-identical in all six places`, () => {
      const reference = readFileSync(join(root, '.claude', 'skills', skill, 'SKILL.md'));
      for (const copy of COPIES) {
        const file = join(root, copy, 'skills', skill, 'SKILL.md');
        expect(existsSync(file), `${copy}/skills/${skill}/SKILL.md is missing`).toBe(true);
        expect(readFileSync(file).equals(reference), `${copy}/skills/${skill}/SKILL.md differs from .claude`).toBe(true);
      }
    });
  }
});
