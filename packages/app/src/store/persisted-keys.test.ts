import { describe, expect, it } from 'vitest';

import { KNOWN_ORPHANS, PREFERENCE_KEYS, SESSION_STATE_KEYS } from './persisted-keys';
import { useUiStore } from './ui-store';

/**
 * Every non-test `.ts`/`.tsx` source file under `features/settings/`, as text.
 *
 * `import.meta.glob` (Vite, not `node:fs`) — the same instrument
 * `icon-names.test.ts` uses, and for the same reason: the renderer's own
 * eslint boundary forbids node builtins under `src/`, `.test.ts` files
 * included.
 */
const SETTINGS_SOURCES = import.meta.glob('../features/settings/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const SETTINGS_SOURCE_TEXT = Object.entries(SETTINGS_SOURCES)
  .filter(([path]) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'))
  .map(([, source]) => source);

/**
 * Every persisted key, read from the store's own `partialize` rather than
 * re-typed here — the same `persist.getOptions()` instrument
 * `ui-store.test.ts` already uses. This is the runtime source of truth
 * `keyof PersistedUi` cannot give a test, since types are erased at runtime.
 */
function actualPersistedKeys(): string[] {
  const partialize = useUiStore.persist.getOptions().partialize;
  if (!partialize) throw new Error('useUiStore has no partialize configured');
  return Object.keys(partialize(useUiStore.getState()));
}

/** A crude but honest check: does *some* file under `features/settings/` name this identifier? */
function isNamedInSettings(key: string): boolean {
  const pattern = new RegExp(`\\b${key}\\b`);
  return SETTINGS_SOURCE_TEXT.some((source) => pattern.test(source));
}

describe('persisted-keys partition', () => {
  it('finds settings sources via the glob (a guard on the guard)', () => {
    expect(SETTINGS_SOURCE_TEXT.length).toBeGreaterThan(10);
  });

  it('has no duplicate entries within PREFERENCE_KEYS', () => {
    expect(new Set(PREFERENCE_KEYS).size).toBe(PREFERENCE_KEYS.length);
  });

  it('has no duplicate entries within SESSION_STATE_KEYS', () => {
    expect(new Set(SESSION_STATE_KEYS).size).toBe(SESSION_STATE_KEYS.length);
  });

  it('has no key in both PREFERENCE_KEYS and SESSION_STATE_KEYS', () => {
    const preferenceSet = new Set<string>(PREFERENCE_KEYS);
    const overlap = SESSION_STATE_KEYS.filter((key) => preferenceSet.has(key));
    expect(overlap).toEqual([]);
  });

  it('covers every key useUiStore actually persists, with no gap and no extra', () => {
    const actual = new Set(actualPersistedKeys());
    const listed = new Set<string>([...PREFERENCE_KEYS, ...SESSION_STATE_KEYS]);

    const missing = [...actual].filter((key) => !listed.has(key));
    const stale = [...listed].filter((key) => !actual.has(key));

    expect(missing).toEqual([]);
    expect(stale).toEqual([]);
  });

  it('has KNOWN_ORPHANS as exactly the five recorded, undocumented preferences', () => {
    expect([...KNOWN_ORPHANS].sort()).toEqual(
      ['browserLayout', 'loopAgents', 'loopChoices', 'loopModels', 'loopSchedules'].sort(),
    );
  });

  it.each(PREFERENCE_KEYS.filter((key) => !(KNOWN_ORPHANS as readonly string[]).includes(key)))(
    'names preference key %s in some file under features/settings/',
    (key) => {
      expect(isNamedInSettings(key)).toBe(true);
    },
  );

  it('fails on a key deliberately unmentioned in settings source (proves the check bites)', () => {
    expect(isNamedInSettings('thisKeyDoesNotExistAnywhereInSettings')).toBe(false);
  });
});
