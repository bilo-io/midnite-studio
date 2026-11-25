import type { CrashEventSource } from '@midnite/studio-runtime';

import type { Logger } from './log';

/** The one `app` event the hooks bind — structural, so this file imports no `electron`. */
export type ChildProcessGoneSource = {
  on(
    event: 'child-process-gone',
    listener: (
      event: unknown,
      details: { type: string; reason: string; exitCode: number; name?: string },
    ) => void,
  ): unknown;
};

/**
 * Studio main's three crash hooks, lifted out of `index.ts` so a unit test can import them
 * (Phase 65 Theme D, decision 12). Not the runtime's `installCrashLogging`: its messages differ
 * and it has no `child-process-gone`; changing Studio's log lines is a separate decision.
 */
export function installMainCrashHooks(
  log: Logger,
  proc: CrashEventSource,
  appEvents: ChildProcessGoneSource,
): void {
  /*
    Main's own crashes, recorded — Phase 65 Theme D.

    Installed here rather than inside `whenReady` on purpose: the boot path is
    where an unhandled rejection is both most likely and most invisible, and a
    handler registered after `whenReady` cannot see the ones raised before it.
    Neither handler exits. Electron's default for an uncaught exception in main is
    to log it and keep running, and this phase changes what is RECORDED, not what
    the app does — turning a survivable exception into a quit would be a
    behaviour change smuggled in under a logging one.
  */
  proc.on('uncaughtException', (err) => {
    log.error('[main] uncaughtException', err);
  });
  proc.on('unhandledRejection', (reason) => {
    log.error('[main] unhandledRejection', reason);
  });

  /*
    A GPU or utility process dying — the only hook that reports it, and it had
    none until Phase 65. This class of failure currently manifests to a user as
    "the window went strange" with no record at all, which is exactly the report
    nobody can act on.
  */
  appEvents.on('child-process-gone', (_event, details) => {
    log.error(
      `[main] child-process-gone type=${details.type} reason=${details.reason} exit=${details.exitCode}${
        details.name === undefined ? '' : ` name=${details.name}`
      }`,
    );
  });
}
