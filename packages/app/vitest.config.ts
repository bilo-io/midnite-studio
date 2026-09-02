import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Serves `styles.css`'s own text to the one test that needs to read it.
 *
 * Vitest stubs every CSS import to an empty string unless `test.css` is on —
 * the right default, since a component test has no business running Tailwind —
 * and that stub swallows `?raw` with it, because it matches on the extension
 * and not on the query. So the specifier deliberately isn't a CSS path at all:
 * a virtual id has no extension for the stub to match, and this plugin is the
 * only thing that answers it.
 *
 * `styles.css` is where the FAB's per-tab sub-spectrum lives, and
 * `loop-spectrum.test.ts` is the guard that a new loop cannot land with an arc
 * and no sampled ramp — a failure that renders as a plausible-looking default
 * rather than as anything wrong. Reading the file here rather than importing
 * `node:fs` from the test also keeps the renderer's "no node builtins under
 * `src/`" boundary intact: build config runs in Node by definition.
 */
const STYLES_RAW = 'virtual:midnite-styles-raw';

function stylesRaw(): Plugin {
  const resolved = `\0${STYLES_RAW}`;
  return {
    name: 'midnite:styles-raw',
    resolveId: (id) => (id === STYLES_RAW ? resolved : null),
    async load(id) {
      if (id !== resolved) return null;
      const path = fileURLToPath(new URL('./src/styles.css', import.meta.url));
      return `export default ${JSON.stringify(await readFile(path, 'utf8'))};`;
    },
  };
}

export default defineConfig({
  plugins: [stylesRaw(), react()],
  resolve: {
    alias: {
      // Mirrors vite.config.ts — tests must resolve the contract the same way
      // the bundle does, or they exercise a different module.
      '@midnite/studio-shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
  },
});
