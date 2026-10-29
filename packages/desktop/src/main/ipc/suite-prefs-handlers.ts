import {
  CHANNELS,
  EVENT_CHANNELS,
  resolveSuitePrefs,
  SuitePrefsSetRequestSchema,
  type SuitePrefsSnapshot,
} from '@midnite/studio-shared';
import { createSuitePrefsService, type SuitePrefsService } from '@midnite/studio-runtime';

import type { Logger } from '../log';
import { handle, handleBare } from './handle';

/**
 * Studio serves the suite-prefs file (Phase 123 Theme L.1) to its renderer.
 *
 * The service is plain node over `<runtime>/suite-prefs.json` — the runtime data
 * directory Studio already hosts in (`studioRuntimeDirectory`, so a throwaway
 * e2e profile keeps its own file and never touches the user's). Every change,
 * this app's own or another app's seen through the watch, goes to every window.
 */
export function registerSuitePrefsHandlers(options: {
  runtimeDirectory: string;
  log: Logger;
  broadcast: (channel: string, payload: SuitePrefsSnapshot) => void;
}): SuitePrefsService {
  const { log } = options;
  const service = createSuitePrefsService({ directory: options.runtimeDirectory, warn: (m) => log.warn(m) });
  service.onChanged((snapshot) => options.broadcast(EVENT_CHANNELS.suitePrefsChanged, snapshot));
  service.watch();

  handleBare(CHANNELS.suitePrefsGet, async (): Promise<SuitePrefsSnapshot> => {
    try {
      return await service.get();
    } catch (err) {
      // An unreadable directory (permissions) must not break the renderer's boot: defaults, logged.
      log.warn(`suite-prefs: read failed (${String(err)}); answering defaults`);
      return resolveSuitePrefs({});
    }
  });

  handle(
    CHANNELS.suitePrefsSet,
    SuitePrefsSetRequestSchema,
    (req) => service.set(req),
    (issue) => ({ ok: false as const, error: issue }),
  );

  return service;
}
