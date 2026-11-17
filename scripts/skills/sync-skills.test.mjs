import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { audit, compare, normalise, splitSkill, write } from './sync-skills.mjs';

const claude = `---\nname: s\ndescription: d\nargument-hint: "[x]"\nallowed-tools: Bash, AskUserQuestion\n---\n\n# S\n\n1. Stop for confirmation via AskUserQuestion.\n`;
const neutral = `---\nname: s\ndescription: d\n---\n\n**Invoke with:** [x]\n\n# S\n\n1. Stop for confirmation.\n`;

describe('compare', () => {
  it('splits frontmatter', () => expect(splitSkill(claude).front).toContain('allowed-tools'));
  it('treats the Claude-only differences as a mirror variant', () => {
    expect(compare(neutral, claude)).toBe('mirror-variant');
    expect(compare(neutral, neutral)).toBe('identical');
  });
  it('flags real drift', () => expect(compare(neutral, claude.replace('# S', '# T'))).toBe('drift'));
  it('normalise is stable', () => expect(normalise(claude)).toBe(normalise(neutral)));
});

describe('audit / write on a temp tree', () => {
  const mk = () => {
    const root = mkdtempSync(join(tmpdir(), 'sync-skills-'));
    const put = (m, text) => {
      mkdirSync(join(root, m, 'skills', 's'), { recursive: true });
      writeFileSync(join(root, m, 'skills', 's', 'SKILL.md'), text);
    };
    put('.agents', neutral);
    put('.claude', claude);
    return { root, put };
  };
  it('reports missing mirrors', () => {
    const { root } = mk();
    expect(audit(root)).toEqual([{ skill: 's', mirrors: { '.claude': 'mirror-variant', '.codex': 'missing' } }]);
  });
  it('write keeps the target frontmatter, replaces the body and creates missing mirrors', () => {
    const { root } = mk();
    writeFileSync(join(root, '.agents/skills/s/SKILL.md'), neutral.replace('# S', '# S2'));
    write(root);
    const c = readFileSync(join(root, '.claude/skills/s/SKILL.md'), 'utf8');
    expect(c).toContain('allowed-tools');
    expect(c).toContain('# S2');
    expect(readFileSync(join(root, '.codex/skills/s/SKILL.md'), 'utf8')).toContain('# S2');
    expect(audit(root)[0].mirrors['.codex']).toBe('identical');
  });
});
