import { INJECTION_THRESHOLD } from '@midnite/studio-runtime';
import { CHANNELS, SecurityScanContentRequest, type SecurityScanContentResponse } from '@midnite/studio-shared';

import { handle } from './handle';
import { scanContent } from './security-scan';

/**
 * The security layer's renderer-facing ops (Phase 121 Theme A). `scanContent` reads nothing and
 * writes nothing; an invalid payload answers a clean, unflagged scan rather than an error, because
 * a banner that cannot be drawn must never block a send.
 */
export function registerSecurityHandlers(): void {
  handle<typeof SecurityScanContentRequest, SecurityScanContentResponse>(
    CHANNELS.securityScanContent,
    SecurityScanContentRequest,
    (req) => scanContent(req.text),
    () => ({ score: 0, threshold: INJECTION_THRESHOLD, flagged: false, signals: [] }),
  );
}
