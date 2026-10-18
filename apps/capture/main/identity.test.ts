// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { CaptureAcceleratorSchema } from '@midnite/studio-shared';
import { runtimeDataDirectory } from '@midnite/studio-runtime';

import { CAPTURE_APP_SHORTCUT, captureUserData, isSmoke, SMOKE_ENV } from './identity';

describe('Capture identity', () => {
  it('keeps userData under the runtime data directory', () => {
    expect(captureUserData('/data')).toBe(`${runtimeDataDirectory('/data')}/apps/capture`);
  });
  it('lets a throwaway run override it, and ignores an empty override', () => {
    expect(captureUserData('/data', '/tmp/x')).toBe('/tmp/x');
    expect(captureUserData('/data', '')).toContain('Midnite Runtime');
  });
  it('treats only MIDNITE_CAPTURE_SMOKE=1 as a smoke run', () => {
    expect(isSmoke({ [SMOKE_ENV]: '1' })).toBe(true);
    expect(isSmoke({ [SMOKE_ENV]: 'true' })).toBe(false);
    expect(isSmoke({})).toBe(false);
  });
  it('ships a chord the settings field itself would accept', () => {
    expect(CaptureAcceleratorSchema.safeParse(CAPTURE_APP_SHORTCUT).success).toBe(true);
  });
});
