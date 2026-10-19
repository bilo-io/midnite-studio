import { describe, expect, it } from 'vitest';

/**
 * Phase 91 Theme G: a lint that fails on the next plaintext credential.
 *
 * Every zustand `persist` store writes its `partialize` slice to localStorage in
 * the clear. This test finds every `partialize` under the renderer packages,
 * collects the keys it names, and fails on any credential-shaped one that is not
 * in {@link ALLOWED_WITH_REASON}. That map is a visible debt register: an entry
 * is either a false positive (the name matches, the value is not a secret) or a
 * real leak with an owner. Removing the last debt entry is the goal state.
 *
 * Why a vitest, not eslint: the fix for a hit is a decision (move it behind the
 * vault, or argue it is not a secret), and the register wants a reason per entry.
 */
const SECRETISH = /key|token|secret|password|passcode|credential|apikey/i;

/** `<file basename>:<key>` -> why it may stay in localStorage. */
const ALLOWED_WITH_REASON: Record<string, string> = {
  // Real debt.
  'ui-store.ts:passcode':
    'legacy lock-screen passcode field, always null since Phase 91 Theme D: the scrypt hash lives in main (lock-passcode.json, 0600); delete with the field',
  'ui-store.ts:agentApiKeys':
    'legacy plaintext LLM keys awaiting migration into the vault (Phase 113 Theme J, migrate-agent-api-keys.ts); drains to {}',
  // False positives: the name matches, the value is a preference, not a credential.
  'ui-store.ts:requirePasscode': 'boolean: whether the lock screen asks for a passcode',
  'ui-store.ts:passcodeOnlyWhenLocked': 'boolean preference',
};

/**
 * Every non-test renderer source, as raw text. `import.meta.glob` rather than
 * `node:fs`, which the renderer's eslint boundary forbids (the same reason
 * `placement.test.ts` globs).
 */
const SOURCES = import.meta.glob(
  [
    '../**/*.{ts,tsx}',
    '../../../frame/src/**/*.{ts,tsx}',
    '../../../features/*/renderer/**/*.{ts,tsx}',
    '!**/*.test.{ts,tsx}',
    '!**/*.spec.ts',
    '!**/node_modules/**',
    '!**/dist/**',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const files = Object.keys(SOURCES);
const read = (file: string): string => SOURCES[file] ?? '';
const baseName = (file: string): string => file.split('/').pop() ?? file;

/** The text of the `partialize` value: from the `:` to the end of its first balanced expression. */
export function partializeBlocks(source: string): string[] {
  const blocks: string[] = [];
  const re = /\bpartialize\s*:/g;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    let i = m.index + m[0].length;
    let depth = 0;
    let started = false;
    const start = i;
    for (; i < source.length; i++) {
      const c = source[i];
      if (c === '(' || c === '{' || c === '[') {
        depth++;
        started = true;
      } else if (c === ')' || c === '}' || c === ']') {
        depth--;
        if (depth < 0) break;
      } else if (c === ',' && depth === 0 && started) {
        break;
      }
    }
    blocks.push(source.slice(start, i));
  }
  return blocks;
}

export function keysNamedIn(block: string): string[] {
  const keys = new Set<string>();
  for (const m of block.matchAll(/(?:^|[{,\s])([A-Za-z_]\w*)\s*:/g)) keys.add(m[1]!);
  for (const m of block.matchAll(/\bstate\.([A-Za-z_]\w*)/g)) keys.add(m[1]!);
  return [...keys];
}

describe('persisted stores never hold a plaintext credential', () => {
  it('finds a credential-shaped key in a synthetic partialize (the lint can fail)', () => {
    const src = `persist(fn, { name: 'x', partialize: (state) => ({ theme: state.theme, apiKey: state.apiKey }) })`;
    const hits = partializeBlocks(src).flatMap(keysNamedIn).filter((k) => SECRETISH.test(k));
    expect(hits).toEqual(['apiKey']);
  });

  it('every credential-shaped partialize key is in the debt register', () => {
    const offenders: string[] = [];
    let seen = 0;
    for (const file of files) {
      const text = read(file);
      if (!text.includes('partialize')) continue;
      for (const block of partializeBlocks(text)) {
        seen++;
        for (const key of keysNamedIn(block)) {
          if (!SECRETISH.test(key)) continue;
          const id = `${baseName(file)}:${key}`;
          if (!(id in ALLOWED_WITH_REASON)) offenders.push(`${file} -> ${key}`);
        }
      }
    }
    expect(seen, 'found no partialize blocks: the scanner is broken').toBeGreaterThan(8);
    expect(offenders, 'move it behind the vault, or add it to ALLOWED_WITH_REASON with a reason').toEqual([]);
  });

  it('has no stale entries in the register', () => {
    const present = new Set<string>();
    for (const file of files) {
      const text = read(file);
      for (const block of partializeBlocks(text)) {
        for (const key of keysNamedIn(block)) present.add(`${baseName(file)}:${key}`);
      }
    }
    for (const id of Object.keys(ALLOWED_WITH_REASON)) {
      expect(present.has(id), `${id} is no longer persisted; delete it from the register`).toBe(true);
    }
  });
});
