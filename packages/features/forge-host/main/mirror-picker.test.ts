import { describe, expect, it } from 'vitest';

import { MirrorConfigSchema } from './mirror-config';
import { addRepo, applySelection, buildPickerRows, parseRepoUrl, toggleRow } from './mirror-picker';

const cfg = (repos: { host: string; owner: string; repo: string; url: string }[] = [], state = {}) => MirrorConfigSchema.parse({ repos, state });
const open = [{ host: 'github.com', owner: 'bilo-io', repo: 'studio', url: 'https://github.com/bilo-io/studio.git' }];
const reach = { host: 'github.com', repos: [
  { owner: 'bilo-io', name: 'studio', fullName: 'bilo-io/studio', url: 'https://github.com/bilo-io/studio.git', private: false },
  { owner: 'bilo-io', name: 'notes', fullName: 'bilo-io/notes', url: 'https://github.com/bilo-io/notes.git', private: true },
  { owner: '..', name: 'evil', fullName: '../evil', url: 'https://github.com/../evil.git', private: false },
] };

describe('buildPickerRows', () => {
  it('lists each repo once, open first, preselecting open repos on a fresh config', () => {
    const rows = buildPickerRows({ config: cfg(), open, reachable: [reach] });
    expect(rows.map((r) => [r.key, r.source, r.selected])).toEqual([
      ['github.com/bilo-io/studio', 'open', true],
      ['github.com/bilo-io/notes', 'reachable', false],
    ]);
    expect(rows[1]?.private).toBe(true);
  });

  it('does not re-select open repos once the user has chosen something', () => {
    const rows = buildPickerRows({ config: cfg([{ host: 'github.com', owner: 'bilo-io', repo: 'notes', url: 'https://github.com/bilo-io/notes.git' }]), open, reachable: [reach] });
    expect(rows.find((r) => r.repo === 'studio')?.selected).toBe(false);
    expect(rows.find((r) => r.repo === 'notes')?.selected).toBe(true);
  });

  it('keeps a configured repo that is no longer reachable, as added', () => {
    const rows = buildPickerRows({ config: cfg([{ host: 'x.io', owner: 'a', repo: 'b', url: 'https://x.io/a/b.git' }]) });
    expect(rows).toMatchObject([{ key: 'x.io/a/b', source: 'added', selected: true }]);
  });
});

describe('selection edits', () => {
  it('an emptied selection is a choice: it is not re-defaulted to the open repos', () => {
    const rows = buildPickerRows({ config: cfg(), open, reachable: [reach] }).map((r) => ({ ...r, selected: false }));
    const saved = applySelection(cfg(), rows);
    expect(saved.picked).toBe(true);
    expect(buildPickerRows({ config: saved, open, reachable: [reach] }).some((r) => r.selected)).toBe(false);
  });

  it('keeps private when a repo is both open and reachable, and merges host casing', () => {
    const rows = buildPickerRows({
      config: cfg(),
      open: [{ host: 'GitHub.com', owner: 'bilo-io', repo: 'notes', url: 'https://github.com/bilo-io/notes.git' }],
      reachable: [reach],
    });
    expect(rows.filter((r) => r.repo === 'notes')).toHaveLength(1);
    expect(rows.find((r) => r.repo === 'notes')).toMatchObject({ source: 'open', private: true, host: 'github.com' });
  });

  it('round-trips toggles into the config and leaves other fields alone', () => {
    const base = { ...cfg(), interval: 'weekly' as const };
    const rows = toggleRow(buildPickerRows({ config: base, open, reachable: [reach] }), 'github.com/bilo-io/notes');
    const next = applySelection(base, rows);
    expect(next.interval).toBe('weekly');
    expect(next.repos.map((r) => r.repo)).toEqual(['studio', 'notes']);
  });

  it('addRepo is idempotent', () => {
    const repo = { host: 'a.io', owner: 'o', repo: 'r', url: 'https://a.io/o/r.git' };
    expect(addRepo(addRepo(cfg(), repo), repo).repos).toHaveLength(1);
  });
});

describe('parseRepoUrl', () => {
  it('parses https and scp-like URLs', () => {
    expect(parseRepoUrl('https://github.com/o/r.git')).toEqual({ ok: true, repo: { host: 'github.com', owner: 'o', repo: 'r', url: 'https://github.com/o/r.git' } });
    expect(parseRepoUrl('git@gitlab.com:o/r.git')).toMatchObject({ ok: true, repo: { host: 'gitlab.com', owner: 'o', repo: 'r' } });
  });
  it('refuses unsafe or malformed input', () => {
    for (const bad of ['--upload-pack=x', 'ext::sh -c evil', 'https://user:tok@github.com/o/r.git', 'https://github.com/only', 'https://github.com/../r.git', '']) {
      expect(parseRepoUrl(bad).ok).toBe(false);
    }
  });
});
