// @vitest-environment node
// vitest/node: no browser capability needed — reads index.html as text and rewrites a string.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { rewriteStudioEntry, STUDIO_RENDERER_ENTRY_SRC } from './vite-studio-entry-plugin';

const page = readFileSync(fileURLToPath(new URL('./index.html', import.meta.url)), 'utf8');

describe("index.html's Studio entry (Phase 113 Theme G)", () => {
  it('loads apps/studio/entry/renderer.ts, and that file exists', () => {
    const modules = [...page.matchAll(/<script type="module" src="([^"]+)"/g)].map((m) => m[1]);
    expect(modules).toEqual([STUDIO_RENDERER_ENTRY_SRC]);
    expect(existsSync(fileURLToPath(new URL(STUDIO_RENDERER_ENTRY_SRC, import.meta.url)))).toBe(true);
  });

  it('dev: points the module script at the /@fs/ URL of the same file', () => {
    const out = rewriteStudioEntry(page, '/repo/apps/studio/entry/renderer.ts');
    expect(out).toContain('<script type="module" src="/@fs/repo/apps/studio/entry/renderer.ts"></script>');
    expect(out).not.toContain(STUDIO_RENDERER_ENTRY_SRC);
  });

  it('fails loudly when the page stops naming the entry, rather than serving a blank window', () => {
    expect(() => rewriteStudioEntry('<script type="module" src="/src/main.tsx"></script>')).toThrow(/no longer loads/);
  });
});
