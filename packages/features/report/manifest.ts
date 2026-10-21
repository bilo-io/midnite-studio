import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS } from '@midnite/studio-shared';

/**
 * The report feature — Report an Issue, for every midnite app.
 *
 * Frame-placed (`FEATURE_PLACEMENT.report` = `frame`): it has no view and no
 * settings page of its own, only a dialog any app mounts once at its root and a
 * main half that answers it. The dialog files to `bilo-io/midnite-apps` through
 * `gh` when it can, falls back to that repo's own issue form when it cannot,
 * and copies the whole report when neither works — the behaviour Studio's
 * Phase 93 dialog had, now shared.
 *
 * **The crash channels come with it.** `reportError` (the renderer's crash
 * report), `reportLogPath`, `reportBundle` and `reportReveal` read and write
 * the composer's log sink, which the composer hands in as a service — so an app
 * wiring this feature gets the whole report surface by registering one module.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process composer
 * reads this file too.
 */
export const reportManifest = defineFeatureManifest({
  feature: 'report',
  owner: 'frame',
  views: [],
  settingsPages: [],
  ipc: [
    CHANNELS.reportLogPath,
    CHANNELS.reportBundle,
    CHANNELS.reportReveal,
    CHANNELS.reportSubmitIssue,
    CHANNELS.reportGhStatus,
    CHANNELS.reportOpenUrl,
    CHANNELS.reportCopy,
  ],
  /** One-way (`send`) channels — a crash report has no answer worth awaiting. */
  sends: [CHANNELS.reportError],
  /** Main asks the dialog to open: an app's native Help ▸ Report an Issue… item. */
  events: [EVENT_CHANNELS.reportOpen],
  mcpTools: [],
});

export type ReportManifest = typeof reportManifest;
