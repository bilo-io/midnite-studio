import { MSTUDIO_PERF_MARK } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loggerFrom } from '../log';
import { registerPerfHandlers } from './perf-handlers';

// `vi.hoisted` because vitest lifts `vi.mock` above the imports: the factory has
// to close over a spy that already exists by then, and this is how it does.
const { on } = vi.hoisted(() => ({ on: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { on } }));

/** The listener main registered, invoked the way `ipcRenderer.send` would. */
function send(raw: unknown): void {
  const [, listener] = on.mock.calls.find(([channel]) => channel === MSTUDIO_PERF_MARK) ?? [];
  if (typeof listener !== 'function') throw new Error('no listener on the perf channel');
  listener({}, raw);
}

describe('perf marks from the renderer (Phase 36 Theme A)', () => {
  beforeEach(() => {
    on.mockClear();
  });

  it('logs a well-formed mark as one parseable line', () => {
    const lines: string[] = [];
    registerPerfHandlers(loggerFrom((m) => lines.push(m)));

    send({ name: 'first-view-rendered', tMs: 812.4 });

    // The format `startup-report.mjs` greps for. Rounded: sub-millisecond
    // precision on a boot measured in hundreds of ms is noise in a table.
    expect(lines).toEqual(['[perf] renderer first-view-rendered 812']);
  });

  it('drops a malformed payload instead of logging a poisoned line', () => {
    const lines: string[] = [];
    registerPerfHandlers(loggerFrom((m) => lines.push(m)));

    // A missing field, a wrong type, a name past the cap, and not an object at
    // all — the report treats the resulting gap as a failed run, which is a
    // louder outcome than `[perf] renderer undefined NaN` in the table.
    send({ name: 'no-time' });
    send({ name: 42, tMs: 1 });
    send({ name: 'x'.repeat(65), tMs: 1 });
    send('renderer-boot');
    send(undefined);

    expect(lines).toEqual([]);
  });
});
