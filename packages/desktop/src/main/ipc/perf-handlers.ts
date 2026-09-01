import { MSTUDIO_PERF_MARK, PerfMarkSchema } from '@midnite/studio-shared';
import { ipcMain } from 'electron';

import { defaultLogger, type Logger } from '../log';

/**
 * Renderer marks, logged next to main's own — Phase 36 Theme A.
 *
 * `ipcMain.on`, not `handle`: a mark has no answer, and awaiting one would
 * perturb the boot being measured (see `metrics-handlers.ts` for the same
 * reasoning about `metrics.start`).
 *
 * The payload is zod-parsed like every other channel even though only our own
 * renderer sends on it. A malformed mark is DROPPED rather than logged
 * defensively: the report treats a missing mark as a failure, so a silent drop
 * surfaces as a loud "missing mark" one layer up, which is the behaviour we
 * want. Logging `[perf] renderer undefined NaN` would poison the table instead.
 */
export function registerPerfHandlers(log: Logger = defaultLogger): void {
  ipcMain.on(MSTUDIO_PERF_MARK, (_event, raw: unknown) => {
    const parsed = PerfMarkSchema.safeParse(raw);
    if (!parsed.success) return;
    log(`[perf] renderer ${parsed.data.name} ${Math.round(parsed.data.tMs)}`);
  });
}
