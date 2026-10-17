import { bootStudioRenderer } from '@midnite/studio-app/boot';

/**
 * Midnite Studio's renderer entry (Phase 113 Theme G) — what `index.html` loads.
 *
 * Studio is the superset app: its shell is `packages/app` (which composes every
 * feature in `src/compose/` and wears the frame), so the entry hands the window's
 * root to that shell's boot and nothing else. The HTML page, the Vite config and
 * `dist/` stay in packages/app, where the packaged app, the perf scripts and the
 * e2e/visual harness read them.
 */
const container = document.getElementById('root');
if (!container) throw new Error('#root missing from index.html');

bootStudioRenderer(container);
