// Phase 77 Theme A — every language id the app hands Monaco must be one Monaco registers.
// An id Monaco does not ship silently falls back to plaintext (`prisma`, `proto` did).
import { describe, expect, it } from 'vitest';

import { MONACO_LANG_BY_EXT, MONACO_LANG_BY_NAME, monacoLanguageForFile } from './monaco-languages';

// Monaco's own registrations, read as text through Vite (no node builtins in the renderer):
// the per-language definitions plus the json feature, which registers `json` itself.
const registrations = import.meta.glob(
  [
    '../../../node_modules/monaco-editor/esm/vs/languages/definitions/*/register.js',
    '../../../node_modules/monaco-editor/esm/vs/languages/features/json/register.js',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

/** Every `id: "…"` those registrations declare, plus `plaintext`. */
function registeredLanguageIds(): Set<string> {
  const ids = new Set<string>(['plaintext']);
  for (const source of Object.values(registrations)) {
    for (const match of source.matchAll(/\bid:\s*"([^"]+)"/g)) ids.add(match[1]!);
  }
  return ids;
}

describe('monaco language ids', () => {
  const registered = registeredLanguageIds();

  it('finds Monaco\'s registrations at all', () => {
    expect(registered.size).toBeGreaterThan(60);
    expect(registered.has('typescript')).toBe(true);
  });

  it.each([
    ['MONACO_LANG_BY_EXT', MONACO_LANG_BY_EXT],
    ['MONACO_LANG_BY_NAME', MONACO_LANG_BY_NAME],
  ])('%s only maps to registered ids or plaintext', (_name, table) => {
    const unknown = Object.entries(table).filter(([, id]) => !registered.has(id));
    expect(unknown).toEqual([]);
  });

  it("keeps .proto on Monaco's proto id and sends .prisma and .diff to plaintext", () => {
    expect(monacoLanguageForFile('schema.proto')).toBe('proto');
    expect(monacoLanguageForFile('x.diff')).toBe('plaintext');
    expect(monacoLanguageForFile('schema.prisma')).toBe('plaintext');
  });
});
