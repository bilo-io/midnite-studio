import { describe, expect, it } from 'vitest';

import type { ChatSkill } from '@midnite/studio-shared';

import {
  findPills,
  findTrigger,
  insertToken,
  matchFiles,
  matchSkills,
  pillAtCaret,
  removePill,
  splitHighlight,
  substringRange,
} from './composer-tokens';

const skill = (name: string): ChatSkill => ({ name, description: `${name} does things`, scope: 'project' });

describe('findTrigger', () => {
  it('opens on a / or @ that starts a word, with the query up to the caret', () => {
    expect(findTrigger('/', 1)).toEqual({ kind: 'skill', start: 0, end: 1, query: '' });
    expect(findTrigger('run /sit now', 8)).toEqual({ kind: 'skill', start: 4, end: 8, query: 'sit' });
    expect(findTrigger('see @src/ap', 11)).toEqual({ kind: 'file', start: 4, end: 11, query: 'src/ap' });
    // The replace range runs to the end of the word, not just the caret.
    expect(findTrigger('@chatcomp', 3)).toEqual({ kind: 'file', start: 0, end: 9, query: 'ch' });
  });

  it('stays closed mid-word, after whitespace and for path-like slash tokens', () => {
    expect(findTrigger('src/app', 4)).toBeNull();
    expect(findTrigger('me@x.com', 5)).toBeNull();
    expect(findTrigger('/usr/bin', 8)).toBeNull();
    expect(findTrigger('/sit ', 5)).toBeNull();
    expect(findTrigger('plain', 3)).toBeNull();
  });
});

describe('matchSkills', () => {
  const skills = ['code-review', 'midnite-sitrep', 'sitrep', 'midnite-create', 'Simplify'].map(skill);

  it('matches any substring case-insensitively, prefix hits first', () => {
    const hits = matchSkills(skills, 'SIT');
    expect(hits.map((h) => h.skill.name)).toEqual(['sitrep', 'midnite-sitrep']);
    expect(hits.map((h) => h.range)).toEqual([
      [0, 3],
      [8, 11],
    ]);
    expect(matchSkills(skills, 'view').map((h) => h.skill.name)).toEqual(['code-review']);
    expect(matchSkills(skills, 'zzz')).toEqual([]);
  });

  it('caps at the limit and passes an empty query through unranked', () => {
    const many = Array.from({ length: 25 }, (_, i) => skill(`s${String(i).padStart(2, '0')}`));
    expect(matchSkills(many, 's')).toHaveLength(10);
    expect(matchSkills(many, '').map((h) => h.skill.name)).toEqual(many.slice(0, 10).map((s) => s.name));
    expect(matchSkills(many, '')[0]!.range).toBeNull();
  });
});

describe('matchFiles', () => {
  const files = ['README.md', 'src/app.tsx', 'src/features/chats/chat-composer.tsx', 'docs/chat.md', 'packages/chats/index.ts'];

  it('ranks a basename hit over a directory-only hit and splits the highlight', () => {
    const hits = matchFiles(files, 'chat');
    expect(hits.map((h) => h.path)).toEqual(['docs/chat.md', 'src/features/chats/chat-composer.tsx', 'packages/chats/index.ts']);
    expect(hits[0]).toMatchObject({ name: 'chat.md', dir: 'docs', nameRange: [0, 4], dirRange: null });
    expect(hits[2]).toMatchObject({ name: 'index.ts', dir: 'packages/chats', nameRange: null, dirRange: [9, 13] });
  });

  it('highlights across the separator when the query spans dir and name', () => {
    const [hit] = matchFiles(files, 'src/ap');
    expect(hit).toMatchObject({ path: 'src/app.tsx', dirRange: [0, 3], nameRange: [0, 2] });
  });

  it('puts shallow files first on an empty query and caps at ten', () => {
    expect(matchFiles(files, '')[0]!.path).toBe('README.md');
    const many = Array.from({ length: 30 }, (_, i) => `f${i}.ts`);
    expect(matchFiles(many, 'f')).toHaveLength(10);
  });
});

describe('highlight helpers', () => {
  it('substringRange and splitHighlight cut around the hit', () => {
    expect(substringRange('Midnite-Sitrep', 'sit')).toEqual([8, 11]);
    expect(substringRange('abc', '')).toBeNull();
    expect(splitHighlight('midnite-sitrep', [8, 11])).toEqual({ before: 'midnite-', match: 'sit', after: 'rep' });
    expect(splitHighlight('x', null)).toEqual({ before: 'x', match: '', after: '' });
  });
});

describe('pills', () => {
  const skills = new Set(['sitrep']);
  const files = new Set(['src/a.ts']);

  it('finds known /skill and @file tokens only', () => {
    expect(findPills('/sitrep check @src/a.ts and /nope @b.ts', skills, files)).toEqual([
      { kind: 'skill', start: 0, end: 7, value: 'sitrep' },
      { kind: 'file', start: 14, end: 23, value: 'src/a.ts' },
    ]);
  });

  it('Backspace targets a pill the caret ends or sits inside', () => {
    const pills = findPills('/sitrep x', skills, files);
    expect(pillAtCaret(pills, 7)).toEqual(pills[0]);
    expect(pillAtCaret(pills, 3)).toEqual(pills[0]);
    expect(pillAtCaret(pills, 8)).toBeUndefined();
    expect(pillAtCaret(pills, 0)).toBeUndefined();
    expect(removePill('/sitrep x', pills[0]!)).toEqual({ text: ' x', caret: 0 });
  });

  it('insertToken replaces the whole trigger word and adds one space', () => {
    expect(insertToken('run /si', { start: 4, end: 7 }, '/sitrep')).toEqual({ text: 'run /sitrep ', caret: 12 });
    expect(insertToken('/si more', { start: 0, end: 3 }, '/sitrep')).toEqual({ text: '/sitrep more', caret: 8 });
  });
});
