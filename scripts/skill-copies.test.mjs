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
    expect(skills).toContain('midnite-media-sprite-build');
    expect(skills).toContain('midnite-media-map-build');
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

// The sitrep family (the `midnite-sitrep` router and its `midnite-sitrep-*` views) ships in the
// repo's three mirrors only, and the `.agents`/`.codex` copies drop the Claude-only `argument-hint`
// and `allowed-tools` frontmatter. Everything else must match, or one CLI renders a different report.
// The union of all three mirrors, so a view added or left behind in only one of them is caught.
const sitrepSkills = [
  ...new Set(
    ['.claude', '.agents', '.codex'].flatMap((copy) =>
      readdirSync(join(root, copy, 'skills')).filter((name) => /^midnite-sitrep(-.+)?$/.test(name)),
    ),
  ),
].sort();
const withoutClaudeOnlyKeys = (text) => text.replace(/^(argument-hint|allowed-tools): .*\n/gm, '');

describe('midnite-sitrep skill family copies', () => {
  it('finds the router and its views', () => {
    expect(sitrepSkills).toEqual(
      expect.arrayContaining(['midnite-sitrep', 'midnite-sitrep-table', 'midnite-sitrep-graph', 'midnite-sitrep-ci']),
    );
  });

  for (const skill of sitrepSkills) {
    it(`${skill} matches across .claude, .agents and .codex`, () => {
      const source = join(root, '.claude', 'skills', skill, 'SKILL.md');
      expect(existsSync(source), `.claude/skills/${skill}/SKILL.md is missing`).toBe(true);
      const reference = withoutClaudeOnlyKeys(readFileSync(source, 'utf8'));
      for (const copy of ['.agents', '.codex']) {
        const file = join(root, copy, 'skills', skill, 'SKILL.md');
        expect(existsSync(file), `${copy}/skills/${skill}/SKILL.md is missing`).toBe(true);
        expect(readFileSync(file, 'utf8'), `${copy}/skills/${skill}/SKILL.md differs from .claude`).toBe(reference);
      }
    });
  }
});
