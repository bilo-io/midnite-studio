// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createDisplayMediaGate } from '@midnite/studio-feature-capture/main';

import {
  installCapturePermissions,
  isCaptureAppOrigin,
  type CapturePermissionSession,
} from './permissions';

function fakeSession() {
  const s = {
    request: null as
      null | ((wc: unknown, p: string, cb: (g: boolean) => void, d: unknown) => void),
    check: null as null | ((wc: unknown, p: string, o: string, d: unknown) => boolean),
    display: null as null | ((req: unknown, cb: (streams: unknown) => void) => void),
  };
  const session: CapturePermissionSession = {
    setPermissionRequestHandler: (h) => void (s.request = h),
    setPermissionCheckHandler: (h) => void (s.check = h),
    setDisplayMediaRequestHandler: (h) => void (s.display = h),
  };
  return { s, session };
}

const ask = (s: ReturnType<typeof fakeSession>['s'], permission: string, details: unknown) => {
  let granted: boolean | null = null;
  s.request?.(undefined, permission, (g) => (granted = g), details);
  return granted;
};

describe("Capture's window permissions", () => {
  it('denies everything while nothing is armed — camera, microphone, notifications, the screen', () => {
    const { s, session } = fakeSession();
    installCapturePermissions(session, createDisplayMediaGate({ isAppOrigin: isCaptureAppOrigin }));
    for (const permission of [
      'media',
      'display-capture',
      'notifications',
      'geolocation',
      'clipboard-read',
    ]) {
      expect(ask(s, permission, { securityOrigin: 'file://', isMainFrame: true })).toBe(false);
      expect(s.check?.(undefined, permission, 'file://', {})).toBe(false);
    }
    let streams: unknown = 'unanswered';
    s.display?.({ securityOrigin: 'file://', videoRequested: true }, (v) => (streams = v));
    expect(streams).toEqual({});
  });

  it('grants one screen stream, for the armed source, from its own origin only', () => {
    const { s, session } = fakeSession();
    const gate = createDisplayMediaGate({ isAppOrigin: isCaptureAppOrigin });
    installCapturePermissions(session, gate);
    gate.arm({ id: 'screen:1:0', name: 'Built-in Display' });
    expect(ask(s, 'media', { securityOrigin: 'https://example.com', mediaTypes: ['video'] })).toBe(
      false,
    );
    expect(ask(s, 'media', { securityOrigin: 'file://', mediaTypes: ['video', 'audio'] })).toBe(
      false,
    );
    expect(ask(s, 'media', { securityOrigin: 'file://', mediaTypes: ['video'] })).toBe(true);
    let streams: unknown = null;
    s.display?.({ securityOrigin: 'file://', videoRequested: true }, (v) => (streams = v));
    expect(streams).toEqual({ video: { id: 'screen:1:0', name: 'Built-in Display' } });
    // One stream per click.
    s.display?.({ securityOrigin: 'file://', videoRequested: true }, (v) => (streams = v));
    expect(streams).toEqual({});
  });
});
