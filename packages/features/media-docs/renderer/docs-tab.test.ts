import { describe, expect, it } from 'vitest';

/**
 * The lazy-chunk boundary (Phase 99 Theme B): nothing the Docs tab imports
 * eagerly may import Tiptap, ProseMirror, lowlight or react-dom/server — they
 * belong to `doc-editor.tsx` / `doc-export-html.tsx`, reached only through
 * `import()`. Walks the static (non-type) import graph from `docs-tab.tsx` and
 * from the package's own barrel, `index.ts`.
 */
const SOURCES = import.meta.glob(['./*.ts', './*.tsx', '!./*.test.ts', '!./*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const HEAVY = /^(@tiptap\/|lowlight|react-dom\/server)/;
const LAZY = new Set(['doc-editor.tsx', 'doc-export-html.tsx', 'doc-extensions.ts', 'slash-commands.ts', 'block-drag-handle.tsx']);

function staticImports(file: string): string[] {
  const src = SOURCES[file] ?? '';
  // `export … from` too: a barrel's re-export loads its module as surely as an import does.
  return [...src.matchAll(/^(?:import|export)\s+(?!type\b)[^'"]*?from\s+'([^']+)';/gms)].map((m) => m[1]!);
}

function resolveLocal(spec: string): string | null {
  if (!spec.startsWith('./') || spec.slice(2).includes('/')) return null;
  for (const ext of ['.ts', '.tsx']) if (SOURCES[spec + ext] !== undefined) return spec + ext;
  return null;
}

describe('Docs lazy boundary', () => {
  it('docs-tab reaches no Tiptap module synchronously', () => {
    const seen = new Set<string>();
    const heavy: string[] = [];
    const walk = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const spec of staticImports(file)) {
        if (HEAVY.test(spec)) heavy.push(`${file.split('/').pop()} → ${spec}`);
        const local = resolveLocal(spec);
        if (local) walk(local);
      }
    };
    walk('./docs-tab.tsx');
    // The package's barrel is what an app imports: it must be as light as the tab.
    walk('./index.ts');
    expect(seen.has('./docs-explorer.tsx')).toBe(true);
    expect(seen.has('./use-doc-thread.ts')).toBe(true);
    expect(heavy).toEqual([]);
    for (const file of seen) expect(LAZY.has(file.split('/').pop()!)).toBe(false);
  });

  it('the editor itself is the module that pulls Tiptap in', () => {
    expect(staticImports('./doc-editor.tsx').some((s) => s.startsWith('@tiptap/'))).toBe(true);
  });
});
