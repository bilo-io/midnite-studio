import { describe, expect, it } from 'vitest';

/**
 * The regression backstop for the bug this batch fixes: every Monaco mount
 * site used to pass BOTH a correct `useStudioMonacoTheme()`-style effect
 * (`code-editor.tsx`, `monaco-field.tsx`) or none at all (`query-editor.tsx`)
 * AND a hardcoded `theme={resolved === 'dark' ? 'vs-dark' : 'vs'}` prop to
 * `<Editor>`. `@monaco-editor/react` calls `monaco.editor.setTheme(theme)`
 * itself whenever that prop is set (confirmed against its source in
 * `@monaco-editor/react`'s `dist/index.mjs`), which silently stomped the
 * `studio-<id>` theme the effect had just installed — the palette "doesn't
 * adjust properly, or at all".
 *
 * `import.meta.glob` (Vite, not `node:fs` — the renderer's eslint boundary
 * forbids node builtins under `src/`) reads every source file as text at
 * transform time, the same mechanism `icon-names.test.ts` uses, so this list
 * cannot go stale as new mount sites are added.
 */
const SOURCES = import.meta.glob('../../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Any `theme={...}` prop passed directly on a JSX `<Editor` element — the
 * exact shape every mount site used to carry. A real Monaco mount installs
 * its theme imperatively via `useStudioMonacoTheme()` and never sets this
 * prop at all, so its mere presence is the bug, regardless of what literal
 * or expression it carries. */
const HARDCODED_THEME_PROP = /<Editor\b[^>]*\btheme\s*=/s;

describe('no Monaco mount site passes a theme prop to <Editor>', () => {
  const offenders = Object.entries(SOURCES)
    .filter(([path]) => !path.endsWith('monaco-theme-prop.test.ts'))
    .filter(([, source]) => HARDCODED_THEME_PROP.test(source))
    .map(([path]) => path);

  it('finds zero occurrences across packages/app/src', () => {
    expect(offenders).toEqual([]);
  });

  it('the regex itself still matches the shape of the historical bug (a canary against a rotted pattern)', () => {
    const bugShape = `<Editor\n  height="100%"\n  theme={resolved === 'dark' ? 'vs-dark' : 'vs'}\n  onMount={handleMount}\n/>`;
    expect(HARDCODED_THEME_PROP.test(bugShape)).toBe(true);
  });
});
