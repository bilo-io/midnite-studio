import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fileURLToPath } from 'node:url';

import { acceptedFlags, audit, compare, extractRefs, lint, normalise, splitSkill, write } from './sync-skills.mjs';

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
    return { root, put };
  };
  it('reports missing mirrors', () => {
    const { root } = mk();
    expect(audit(root)).toEqual([{ skill: 's', mirrors: { '.claude': 'missing' } }]);
  });
  it('reports a Claude copy that differs only in its intentional variants', () => {
    const { root, put } = mk();
    put('.claude', claude);
    expect(audit(root)).toEqual([{ skill: 's', mirrors: { '.claude': 'mirror-variant' } }]);
  });
  it('write keeps the target frontmatter, replaces the body and creates missing mirrors', () => {
    const { root, put } = mk();
    put('.claude', claude);
    writeFileSync(join(root, '.agents/skills/s/SKILL.md'), neutral.replace('# S', '# S2'));
    write(root);
    const c = readFileSync(join(root, '.claude/skills/s/SKILL.md'), 'utf8');
    expect(c).toContain('allowed-tools');
    expect(c).toContain('# S2');
    rmSync(join(root, '.claude/skills/s'), { recursive: true });
    write(root);
    expect(readFileSync(join(root, '.claude/skills/s/SKILL.md'), 'utf8')).toContain('# S2');
  });
});

describe('lint', () => {
  const tree = (files) => {
    const root = mkdtempSync(join(tmpdir(), 'sync-lint-'));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(root, rel, '..'), { recursive: true });
      writeFileSync(join(root, rel), text);
    }
    return root;
  };
  const skill = (body) => `---\nname: s\ndescription: d\n---\n\n${body}\n`;

  it('extracts script refs with the flags on the same command and the step-wide --no-llm', () => {
    const refs = extractRefs('Run `node scripts/skills/a.mjs --json --x 1` then `scripts/skills/b.sh`. Add `--no-llm`.');
    expect(refs).toEqual([
      { line: 1, script: 'scripts/skills/a.mjs', flags: ['--json', '--x', '--no-llm'] },
      { line: 1, script: 'scripts/skills/b.sh', flags: ['--no-llm'] },
    ]);
  });
  it('ignores scripts outside scripts/skills (another repo owns them)', () => {
    expect(extractRefs('Run `node scripts/render.mjs`.')).toEqual([]);
  });
  it('reports missing scripts, unknown flags and undefined variables, and passes a clean tree', () => {
    const root = tree({
      'scripts/skills/ok.mjs': "// accepts --json and --no-llm (no-op)\nargv.includes('--json')\n",
      'scripts/skills/ok.sh': '#!/bin/sh\n',
      '.agents/skills/s/SKILL.md': skill('`node scripts/skills/ok.mjs --json --bogus` `scripts/skills/gone.mjs` `${S}media/x.sh`'),
    });
    expect(lint(root).map((p) => [p.kind, p.detail])).toEqual([
      ['unknown-flag', 'scripts/skills/ok.mjs does not accept --bogus'],
      ['missing-script', 'scripts/skills/gone.mjs'],
      ['undefined-variable', '${S}media/x.sh uses a variable no step defines'],
    ]);
    writeFileSync(join(root, '.agents/skills/s/SKILL.md'), skill('`node scripts/skills/ok.mjs --json --no-llm`'));
    expect(lint(root)).toEqual([]);
  });
  it('a .sh wrapper accepts the flags of its .mjs sibling', () => {
    const root = tree({ 'scripts/skills/w.sh': 'exec node w.mjs\n', 'scripts/skills/w.mjs': "'--cap'" });
    expect([...acceptedFlags(join(root, 'scripts/skills/w.sh'))]).toEqual(['--cap']);
  });
  it('flags non-SKILL files that differ between mirrors or exist in only one', () => {
    const root = tree({
      '.agents/skills/s/SKILL.md': skill('x'),
      '.claude/skills/s/SKILL.md': skill('x'),
      '.agents/skills/s/run.sh': 'a',
      '.claude/skills/s/run.sh': 'b',
      '.agents/skills/s/only.md': 'a',
    });
    expect(lint(root).map((p) => p.kind).sort()).toEqual(['mirror-drift', 'mirror-missing']);
  });
  // Keeps the real tree honest: a skill that names a script or flag that does not exist fails here.
  it('the real skill tree lints clean', () => {
    const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
    expect(lint(root)).toEqual([]);
  });
});
