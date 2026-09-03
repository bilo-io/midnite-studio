import { CHANNELS } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Registers through the real `electron.ipcMain` (`handle.ts`'s own doc
 * comment), so testing it means capturing what it registers — the same
 * `vi.mock('electron', …)` shape the other handler suites use.
 */
const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, raw: unknown) => unknown>(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (event: unknown, raw: unknown) => unknown) => {
      handlers.set(channel, fn);
    }),
    on: vi.fn(),
  },
}));

import { registerReleaseNotesHandlers } from './release-notes-handlers';

const CHANGELOG = `# Changelog

## [1.2.3] - 2026-08-01

### Fixed

- The rail hairline.

## [1.2.2] - 2026-07-01

Older.
`;

const invoke = (raw: unknown) => handlers.get(CHANNELS.updateReleaseNotes)?.({}, raw);

const respond = (body: string, ok = true, status = 200) =>
  vi.fn(async () => ({ ok, status, text: async () => body }) as unknown as Response);

beforeEach(() => {
  handlers.clear();
});

describe('release notes handler', () => {
  it('returns just this version’s section', async () => {
    registerReleaseNotesHandlers(respond(CHANGELOG));
    await expect(invoke({ version: '1.2.3' })).resolves.toEqual({
      version: '1.2.3',
      notes: '### Fixed\n\n- The rail hairline.',
      error: null,
    });
  });

  /*
    A version the public mirror has not caught up with is the normal case for a
    fresh build, not a failure — `error` stays null so the popover says "not
    published yet" rather than "could not reach the mirror".
  */
  it('reports a missing section as notes-null, not an error', async () => {
    registerReleaseNotesHandlers(respond(CHANGELOG));
    await expect(invoke({ version: '9.9.9' })).resolves.toEqual({
      version: '9.9.9',
      notes: null,
      error: null,
    });
  });

  it('carries an HTTP failure through as an error', async () => {
    registerReleaseNotesHandlers(respond('', false, 404));
    await expect(invoke({ version: '1.2.3' })).resolves.toEqual({
      version: '1.2.3',
      notes: null,
      error: 'changelog: HTTP 404',
    });
  });

  // Resolves rather than rejects, for the reason `handle.ts` gives: an
  // exception crossing `invoke` reaches the renderer with its cause gone.
  it('resolves rather than rejecting when the fetch throws', async () => {
    registerReleaseNotesHandlers(
      vi.fn(async () => {
        throw new Error('getaddrinfo ENOTFOUND');
      }),
    );
    await expect(invoke({ version: '1.2.3' })).resolves.toEqual({
      version: '1.2.3',
      notes: null,
      error: 'getaddrinfo ENOTFOUND',
    });
  });

  it('refuses a malformed payload without reaching the network', async () => {
    const fetchImpl = respond(CHANGELOG);
    registerReleaseNotesHandlers(fetchImpl);
    const result = (await invoke({ version: '' })) as { error: string | null };
    expect(result.error).toContain(CHANNELS.updateReleaseNotes);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
