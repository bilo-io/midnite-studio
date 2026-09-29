import { describe, expect, it } from 'vitest';

import { docSessionReducer as r, INITIAL_DOC_SESSION, isDirty } from './doc-session';
import { filterDocs, toDocPath } from './docs-explorer';
import { filterSlashItems } from './slash-commands';

const opened = r(r(INITIAL_DOC_SESSION, { type: 'open', key: 'p/a.md' }), { type: 'disk', text: 'v1' });

describe('docSessionReducer', () => {
  it('loads the disk text once, and bumps the editor nonce', () => {
    expect(opened).toMatchObject({ base: 'v1', draft: 'v1', conflict: false });
    expect(opened.nonce).toBe(2);
  });

  it('is dirty after an edit and clean once the save lands', () => {
    const edited = r(opened, { type: 'edit', text: 'v2' });
    expect(isDirty(edited)).toBe(true);
    const saved = r(edited, { type: 'saved', text: 'v2' });
    expect(isDirty(saved)).toBe(false);
    // The watcher echoing our own save changes nothing.
    expect(r(saved, { type: 'disk', text: 'v2' })).toBe(saved);
  });

  it('reloads an external change when there are no unsaved edits', () => {
    const next = r(opened, { type: 'disk', text: 'external' });
    expect(next).toMatchObject({ base: 'external', draft: 'external', conflict: false, nonce: opened.nonce + 1 });
  });

  it('raises the banner for an external change over unsaved edits, and resolves either way', () => {
    const conflicted = r(r(opened, { type: 'edit', text: 'mine' }), { type: 'disk', text: 'theirs' });
    expect(conflicted.conflict).toBe(true);
    expect(conflicted.draft).toBe('mine');
    expect(r(conflicted, { type: 'reload', text: 'theirs' })).toMatchObject({ draft: 'theirs', conflict: false });
    const kept = r(conflicted, { type: 'keepMine', text: 'theirs' });
    expect(kept).toMatchObject({ draft: 'mine', base: 'theirs', conflict: false });
    expect(isDirty(kept)).toBe(true);
  });

  it('resets on a doc switch', () => {
    expect(r(opened, { type: 'open', key: 'p/b.md' })).toMatchObject({ key: 'p/b.md', base: null, draft: null });
    expect(r(opened, { type: 'open', key: 'p/a.md' })).toBe(opened);
  });
});

describe('explorer helpers', () => {
  it('adds .md to a new doc name', () => {
    expect(toDocPath(' overview ')).toBe('overview.md');
    expect(toDocPath('a.md')).toBe('a.md');
  });

  it('filters by project name or doc name', () => {
    const projects = [
      { name: 'handbook', docs: ['intro.md', 'setup.md'] },
      { name: 'launch', docs: ['brief.md'] },
    ];
    expect(filterDocs(projects, '')).toHaveLength(2);
    expect(filterDocs(projects, 'hand')).toEqual([{ name: 'handbook', docs: ['intro.md', 'setup.md'] }]);
    expect(filterDocs(projects, 'brief')).toEqual([{ name: 'launch', docs: ['brief.md'] }]);
    expect(filterDocs(projects, 'zzz')).toEqual([]);
  });
});

describe('slash menu', () => {
  it('lists every block type plus Ask AI, filtered by label or keyword', () => {
    expect(filterSlashItems('').map((i) => i.id)).toEqual([
      'h1', 'h2', 'h3', 'bullet', 'ordered', 'todo', 'quote', 'code', 'table', 'divider', 'ai',
    ]);
    expect(filterSlashItems('task').map((i) => i.id)).toEqual(['todo']);
    expect(filterSlashItems('ai').map((i) => i.id)).toContain('ai');
  });
});
