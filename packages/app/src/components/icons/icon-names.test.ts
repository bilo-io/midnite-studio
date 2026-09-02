import * as Go from 'react-icons/go';
import * as Lu from 'react-icons/lu';
import { describe, expect, it } from 'vitest';

/**
 * Every name the renderer imports from a `react-icons` set must actually be an
 * export of that set.
 *
 * Phase 36 Theme D moved the whole renderer off `lucide-react` onto
 * `react-icons/lu` by prefixing each glyph name with `Lu` — a rename applied
 * across 54 files, where a single typo'd or non-existent name is a component
 * that renders nothing. `tsc` catches most of that, but only where the import
 * is *typed*: this test is the mechanical backstop, and it is also the thing
 * that keeps catching it for icons added long after the migration.
 *
 * `react-icons/lu` is the everyday set but not the only one — `react-icons/go`
 * carries glyphs Lucide has no equivalent for (`GoCommandPalette`, `GoBeaker`),
 * and the same failure mode applies to it, so it gets the same backstop.
 *
 * The lists are derived from the sources rather than hardcoded, so they cannot
 * go stale. `import.meta.glob` (Vite, not node:fs — the renderer's eslint
 * boundary forbids node builtins under `src/`) reads every source file as text
 * at transform time.
 */
const SOURCES = import.meta.glob('../../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/**
 * Matches an import of one set, single- or multi-line, aliased or not — the two
 * shapes being `{ LuCheck }` and `{ LuFile as FileIcon }`. Real names in that
 * example on purpose: Vite excludes the globbing file from its own glob, but if
 * that ever changed a made-up placeholder here would fail the suite.
 */
function importRe(set: string): RegExp {
  return new RegExp(`import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s+from\\s+'react-icons/${set}';`, 'g');
}

function importedNames(set: string): Map<string, string[]> {
  const pattern = importRe(set);
  const byName = new Map<string, string[]>();
  for (const [path, source] of Object.entries(SOURCES)) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source))) {
      for (const spec of (match[1] ?? '').split(',')) {
        const name = (spec.trim().split(/\s+as\s+/)[0] ?? '').trim();
        if (!name) continue;
        byName.set(name, [...(byName.get(name) ?? []), path]);
      }
    }
  }
  return byName;
}

/** `[set, prefix, module namespace, how many imports must at least be found]`. */
const SETS = [
  ['lu', 'Lu', Lu, 50],
  ['go', 'Go', Go, 3],
] as const;

describe.each(SETS)('react-icons/%s imports', (set, prefix, module, floor) => {
  const imported = importedNames(set);

  it('finds the icon imports in the renderer sources', () => {
    // A guard on the guard: if the glob or the regex ever stops matching, the
    // per-name assertions below would all vacuously pass.
    expect(imported.size).toBeGreaterThanOrEqual(floor);
  });

  it('every imported name is a defined component', () => {
    const registry = module as unknown as Record<string, unknown>;
    const broken = [...imported.entries()]
      .filter(([name]) => typeof registry[name] !== 'function')
      .map(([name, files]) => `${name} (${files.join(', ')})`);
    expect(broken).toEqual([]);
  });

  it('imports every name with the set prefix, never a bare glyph name', () => {
    const unprefixed = [...imported.keys()].filter((name) => !name.startsWith(prefix));
    expect(unprefixed).toEqual([]);
  });
});
