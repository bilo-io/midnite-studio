import { fileURLToPath } from 'node:url';

import type { Plugin } from 'vite';

/**
 * Studio's renderer entry, as `index.html` names it (Phase 113 Theme G).
 *
 * The module script lives in the app that composes Studio —
 * `apps/studio/entry/renderer.ts`, which mounts this package's `src/boot.tsx` —
 * while the page, this config and `dist/` stay here, where the packaged app, the
 * perf scripts and the e2e/visual harness read them.
 *
 * `vite build` resolves the relative `src` against the page, so the built
 * `dist/index.html` needs nothing. The dev server does not: it hands the page
 * to the browser with the attribute untouched, the browser clamps `../..` at
 * the origin root and asks for `/apps/studio/…`, and the SPA fallback answers
 * with `index.html`. So in dev the one attribute is rewritten to Vite's
 * `/@fs/` URL for the same file — the form Vite itself uses for a module
 * outside the root (the workspace root is inside `server.fs.allow` by default).
 */
export const STUDIO_RENDERER_ENTRY_SRC = '../../apps/studio/entry/renderer.ts';

const DEFAULT_ENTRY_FILE = fileURLToPath(new URL(STUDIO_RENDERER_ENTRY_SRC, import.meta.url));

/** Rewrites `index.html`'s Studio entry `src` to its `/@fs/` URL. Throws if the page stops naming it. */
export function rewriteStudioEntry(html: string, entryFile: string = DEFAULT_ENTRY_FILE): string {
  const attribute = `src="${STUDIO_RENDERER_ENTRY_SRC}"`;
  if (!html.includes(attribute)) {
    throw new Error(`index.html no longer loads ${STUDIO_RENDERER_ENTRY_SRC} — update vite-studio-entry-plugin.ts with it`);
  }
  const posix = entryFile.replace(/\\/g, '/').replace(/^\/+/, '');
  return html.replace(attribute, `src="/@fs/${posix}"`);
}

/** Dev-server only: the build resolves the relative `src` itself. */
export function studioEntryPlugin(): Plugin {
  return {
    name: 'midnite-studio-entry',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => rewriteStudioEntry(html),
    },
  };
}
