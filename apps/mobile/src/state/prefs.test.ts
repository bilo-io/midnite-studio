// vitest/jsdom: the prefs blob parsing and store transitions (Phase 146 F6). Pure logic over a mocked secure store.
import { beforeEach, describe, expect, it } from 'vitest';
import { store } from '../../test/mocks/expo-secure-store';
import { DEFAULT_PREFS, PREFS_KEY, parsePrefs, selectBranch, usePrefs } from './prefs';

const repo = (n: number) => ({ owner: 'o', name: `r${n}`, defaultBranch: 'main' });
const settle = () => new Promise((r) => setTimeout(r, 0)); // allow-timeout: flush the fire-and-forget persist

beforeEach(() => {
  store.clear();
  usePrefs.setState({ ...DEFAULT_PREFS, hydrated: false });
});

describe('parsePrefs', () => {
  it('returns defaults for null, malformed JSON and an invalid shape', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{nope')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs(JSON.stringify({ ...DEFAULT_PREFS, theme: 'sepia' }))).toEqual(DEFAULT_PREFS);
    expect(parsePrefs(JSON.stringify({ ...DEFAULT_PREFS, version: 2 }))).toEqual(DEFAULT_PREFS);
  });

  it('strips unknown keys and keeps valid values', () => {
    const parsed = parsePrefs(JSON.stringify({ ...DEFAULT_PREFS, theme: 'dark', extra: 1 }));
    expect(parsed.theme).toBe('dark');
    expect('extra' in parsed).toBe(false);
  });
});

describe('usePrefs', () => {
  it('hydrates from the stored blob and does not write back on hydrate', async () => {
    store.set(PREFS_KEY, JSON.stringify({ ...DEFAULT_PREFS, theme: 'light' }));
    await usePrefs.getState().hydrate();
    await settle();
    expect(usePrefs.getState().theme).toBe('light');
    expect(usePrefs.getState().hydrated).toBe(true);
    expect(JSON.parse(store.get(PREFS_KEY)!).theme).toBe('light');
  });

  it('selecting a repo pins it first, caps recents at five and resets its branch', async () => {
    await usePrefs.getState().hydrate();
    usePrefs.getState().setBranch(repo(1), 'dev');
    for (let i = 1; i <= 6; i++) usePrefs.getState().setCurrentRepo(repo(i));
    const s = usePrefs.getState();
    expect(s.recentRepos.map((r) => r.name)).toEqual(['r6', 'r5', 'r4', 'r3', 'r2']);
    usePrefs.getState().setBranch(repo(6), 'feature');
    expect(selectBranch(usePrefs.getState())).toBe('feature');
    usePrefs.getState().setCurrentRepo(repo(6));
    expect(selectBranch(usePrefs.getState())).toBe('main');
  });

  it('persists a change after hydration', async () => {
    await usePrefs.getState().hydrate();
    usePrefs.getState().setTheme('dark');
    await settle();
    expect(JSON.parse(store.get(PREFS_KEY)!).theme).toBe('dark');
    expect('hydrated' in JSON.parse(store.get(PREFS_KEY)!)).toBe(false);
  });
});
