import { INJECTION_THRESHOLD, exceedsThreshold, scoreInjection, stripFlaggedRuns } from '@midnite/studio-runtime';
import type { SecurityScanContentResponse } from '@midnite/studio-shared';

/**
 * `security.scanContent`'s body (Phase 121 Theme A): the runtime's pure injection detector over text
 * a renderer is about to put in a prompt. Split from the handler so it tests without Electron.
 */
export function scanContent(text: string): SecurityScanContentResponse {
  const scan = scoreInjection(text);
  const flagged = exceedsThreshold(scan);
  return {
    score: scan.score,
    threshold: INJECTION_THRESHOLD,
    flagged,
    signals: scan.signals.map(({ id, weight }) => ({ id, weight })),
    ...(flagged ? { stripped: stripFlaggedRuns(text, scan) } : {}),
  };
}

