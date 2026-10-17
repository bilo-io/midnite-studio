import { describe, expect, it, vi } from 'vitest';

import {
  allowAppAudioOnly,
  cancelDownload,
  checkNavigationUrl,
  denyAllPermissions,
  isAppOrigin,
  isAudioOnlyAppCheck,
  isAudioOnlyAppRequest,
} from './browser-security';

/** A `session`-shaped fake that keeps the handlers it was given. */
function fakeSession() {
  const requests: ((
    wc: unknown,
    permission: string,
    callback: (granted: boolean) => void,
    details: unknown,
  ) => void)[] = [];
  const checks: ((
    wc: unknown,
    permission: string,
    origin: string,
    details?: unknown,
  ) => boolean)[] = [];
  return {
    requests,
    checks,
    setPermissionRequestHandler: vi.fn((handler: (typeof requests)[number]) =>
      requests.push(handler),
    ),
    setPermissionCheckHandler: vi.fn((handler: (typeof checks)[number]) => checks.push(handler)),
  };
}

describe('denyAllPermissions', () => {
  /*
    This is the **browser-pane** session's policy, and the assertion below says
    so by name rather than only by rule: Phase 79 Theme F opened exactly one
    hole for the app's own renderer, and the thing most worth guarding is that
    the hole did not reach this session. A `persist:browser` page asking for
    audio from its own origin is refused here, and that is the case a future
    refactor is most likely to break.
  */
  it('refuses every permission for the browser-pane session, audio included', () => {
    const session = fakeSession();
    denyAllPermissions(session);

    const callback = vi.fn();
    session.requests[0]?.(undefined, 'media', callback, {
      mediaTypes: ['audio'],
      securityOrigin: 'https://example.com',
    });
    // Even a page pretending to be us: the session is what decides, not the origin.
    session.requests[0]?.(undefined, 'media', callback, {
      mediaTypes: ['audio'],
      securityOrigin: 'file://',
    });
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenNthCalledWith(1, false);
    expect(callback).toHaveBeenNthCalledWith(2, false);

    expect(
      session.checks[0]?.(undefined, 'media', 'file://', { mediaType: 'audio' }),
    ).toBe(false);
  });

  it('registers a request handler that always denies', () => {
    const requestHandlers: ((wc: unknown, permission: string, callback: (g: boolean) => void, details: unknown) => void)[] = [];
    const checkHandlers: ((wc: unknown, permission: string, origin: string) => boolean)[] = [];
    const session = {
      setPermissionRequestHandler: vi.fn((h) => requestHandlers.push(h)),
      setPermissionCheckHandler: vi.fn((h) => checkHandlers.push(h)),
    };

    denyAllPermissions(session);

    expect(session.setPermissionRequestHandler).toHaveBeenCalledTimes(1);
    expect(session.setPermissionCheckHandler).toHaveBeenCalledTimes(1);

    const callback = vi.fn();
    requestHandlers[0]?.(undefined, 'camera', callback, undefined);
    requestHandlers[0]?.(undefined, 'clipboard-read', callback, undefined);
    expect(callback).toHaveBeenCalledWith(false);
    expect(callback).toHaveBeenCalledTimes(2);

    expect(checkHandlers[0]?.(undefined, 'geolocation', 'https://example.com')).toBe(false);
    expect(checkHandlers[0]?.(undefined, 'notifications', 'https://example.com')).toBe(false);
  });
});

describe('checkNavigationUrl', () => {
  it('allows http and https', () => {
    expect(checkNavigationUrl('https://example.com').allowed).toBe(true);
    expect(checkNavigationUrl('http://example.com').allowed).toBe(true);
  });

  it('blocks file, javascript, data and custom schemes', () => {
    expect(checkNavigationUrl('file:///etc/passwd')).toEqual({ allowed: false, blockedScheme: 'file:' });
    expect(checkNavigationUrl('javascript:alert(1)')).toEqual({
      allowed: false,
      blockedScheme: 'javascript:',
    });
    expect(checkNavigationUrl('data:text/html,hi')).toEqual({ allowed: false, blockedScheme: 'data:' });
    expect(checkNavigationUrl('mstudio-file://repo/x')).toEqual({
      allowed: false,
      blockedScheme: 'mstudio-file:',
    });
  });

  it('blocks an unparseable URL rather than throwing', () => {
    expect(checkNavigationUrl('not a url').allowed).toBe(false);
  });
});

describe('cancelDownload', () => {
  it('cancels the item and reports its filename', () => {
    const item = { getFilename: () => 'report.pdf', cancel: vi.fn() };
    const notify = vi.fn();

    cancelDownload(item, notify);

    expect(item.cancel).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('report.pdf');
  });
});


/*
  What Electron 33.4.11 actually hands the two handlers while a page calls
  `getUserMedia({ audio: true })` — recorded with a probe that logged their
  arguments, not inferred from the docs. The carve-out once compared against
  `'file://'`/`'null'` and a slash-less dev origin, matched none of these, and
  so refused the app's own microphone in every build. These are the strings a
  future Electron upgrade has to keep passing.
*/
const RECORDED = {
  packagedRequest: {
    isMainFrame: true,
    mediaTypes: ['audio'],
    requestingUrl: 'file:///Applications/Midnite%20Studio.app/Contents/Resources/renderer/index.html',
    securityOrigin: 'file:///',
  },
  packagedCheckOrigin: 'file:///',
  packagedCheckOriginAsPageUrl:
    'file:///Applications/Midnite%20Studio.app/Contents/Resources/renderer/index.html',
  packagedCheck: {
    embeddingOrigin: 'file:///',
    isMainFrame: true,
    mediaType: 'audio',
    requestingUrl: 'file:///Applications/Midnite%20Studio.app/Contents/Resources/renderer/index.html',
  },
  devRequest: {
    isMainFrame: true,
    mediaTypes: ['audio'],
    requestingUrl: 'http://localhost:5173/',
    securityOrigin: 'http://localhost:5173/',
  },
  devCheckOrigin: 'http://localhost:5173/',
  devCheck: {
    embeddingOrigin: 'http://localhost:5173/',
    isMainFrame: true,
    mediaType: 'audio',
    requestingUrl: 'http://localhost:5173/',
  },
} as const;

describe('isAppOrigin', () => {
  it('accepts every spelling of the packaged bundle Electron actually sends', () => {
    expect(isAppOrigin(RECORDED.packagedCheckOrigin, null)).toBe(true);
    expect(isAppOrigin(RECORDED.packagedCheckOriginAsPageUrl, null)).toBe(true);
    // The serialised-origin spelling, which this used to accept exclusively.
    expect(isAppOrigin('file://', null)).toBe(true);
  });

  it('accepts the dev server only when one was passed, slash or no slash', () => {
    expect(isAppOrigin(RECORDED.devCheckOrigin, 'http://localhost:5173')).toBe(true);
    expect(isAppOrigin('http://localhost:5173', 'http://localhost:5173')).toBe(true);
    expect(isAppOrigin('http://localhost:5173', 'http://localhost:5173/')).toBe(true);
    expect(isAppOrigin(RECORDED.devCheckOrigin, null)).toBe(false);
  });

  it('refuses everything else, a look-alike port and an opaque origin included', () => {
    expect(isAppOrigin('https://example.com', 'http://localhost:5173')).toBe(false);
    expect(isAppOrigin('http://localhost:5174/', 'http://localhost:5173')).toBe(false);
    expect(isAppOrigin('https://localhost:5173/', 'http://localhost:5173')).toBe(false);
    expect(isAppOrigin(undefined, 'http://localhost:5173')).toBe(false);
    expect(isAppOrigin('', 'http://localhost:5173')).toBe(false);
    // A sandboxed or `data:` frame. The app's own UI never has one.
    expect(isAppOrigin('null', null)).toBe(false);
  });
});

describe('isAudioOnlyAppRequest', () => {
  const dev = 'http://localhost:5173';

  it('grants the recorded packaged and dev requests', () => {
    expect(isAudioOnlyAppRequest('media', RECORDED.packagedRequest, null)).toBe(true);
    expect(isAudioOnlyAppRequest('media', RECORDED.devRequest, dev)).toBe(true);
  });

  it('grants media for the app origin when mediaTypes is exactly [audio]', () => {
    expect(
      isAudioOnlyAppRequest('media', { mediaTypes: ['audio'], securityOrigin: 'file://' }, null),
    ).toBe(true);
    expect(
      isAudioOnlyAppRequest('media', { mediaTypes: ['audio'], securityOrigin: dev }, dev),
    ).toBe(true);
  });

  it('refuses a subframe even from our own origin', () => {
    expect(
      isAudioOnlyAppRequest('media', { ...RECORDED.packagedRequest, isMainFrame: false }, null),
    ).toBe(false);
  });

  /*
    The load-bearing negative. Electron's callback is one boolean over the whole
    request, so approving `['audio','video']` would hand over the camera as
    well — it is refused outright rather than downgraded.
  */
  it('refuses audio+video rather than downgrading it to audio', () => {
    expect(
      isAudioOnlyAppRequest(
        'media',
        { mediaTypes: ['audio', 'video'], securityOrigin: 'file://' },
        null,
      ),
    ).toBe(false);
    expect(
      isAudioOnlyAppRequest('media', { mediaTypes: ['video'], securityOrigin: 'file://' }, null),
    ).toBe(false);
  });

  it('refuses a bare media request with no mediaTypes — the ambiguous case could be a camera', () => {
    expect(isAudioOnlyAppRequest('media', { securityOrigin: 'file://' }, null)).toBe(false);
    expect(isAudioOnlyAppRequest('media', undefined, null)).toBe(false);
  });

  it('accepts the audio-specific permission names, which carry no mediaTypes', () => {
    expect(isAudioOnlyAppRequest('audioCapture', { securityOrigin: 'file://' }, null)).toBe(true);
    expect(isAudioOnlyAppRequest('microphone', { securityOrigin: 'file://' }, null)).toBe(true);
    expect(isAudioOnlyAppRequest('videoCapture', { securityOrigin: 'file://' }, null)).toBe(false);
  });

  it('refuses audio from any origin that is not ours', () => {
    expect(
      isAudioOnlyAppRequest(
        'media',
        { mediaTypes: ['audio'], securityOrigin: 'https://example.com' },
        dev,
      ),
    ).toBe(false);
  });

  it('refuses every other permission outright', () => {
    for (const permission of [
      'camera',
      'geolocation',
      'notifications',
      'display-capture',
      'clipboard-read',
      'midiSysex',
    ]) {
      expect(isAudioOnlyAppRequest(permission, { securityOrigin: 'file://' }, null)).toBe(false);
    }
  });
});

describe('isAudioOnlyAppCheck', () => {
  it('grants the recorded packaged and dev checks', () => {
    expect(
      isAudioOnlyAppCheck('media', RECORDED.packagedCheck, RECORDED.packagedCheckOrigin, null),
    ).toBe(true);
    expect(
      isAudioOnlyAppCheck(
        'media',
        RECORDED.packagedCheck,
        RECORDED.packagedCheckOriginAsPageUrl,
        null,
      ),
    ).toBe(true);
    expect(
      isAudioOnlyAppCheck('media', RECORDED.devCheck, RECORDED.devCheckOrigin, 'http://localhost:5173'),
    ).toBe(true);
  });

  it('refuses a subframe even from our own origin', () => {
    expect(
      isAudioOnlyAppCheck(
        'media',
        { ...RECORDED.packagedCheck, isMainFrame: false },
        RECORDED.packagedCheckOrigin,
        null,
      ),
    ).toBe(false);
  });

  it('reads the singular mediaType the check API is given', () => {
    expect(isAudioOnlyAppCheck('media', { mediaType: 'audio' }, 'file://', null)).toBe(true);
    expect(isAudioOnlyAppCheck('media', { mediaType: 'video' }, 'file://', null)).toBe(false);
    expect(isAudioOnlyAppCheck('media', { mediaType: 'unknown' }, 'file://', null)).toBe(false);
  });

  it('falls back to the details origin when the argument is empty', () => {
    expect(
      isAudioOnlyAppCheck('media', { mediaType: 'audio', securityOrigin: 'file://' }, '', null),
    ).toBe(true);
    expect(
      isAudioOnlyAppCheck(
        'media',
        { mediaType: 'audio', securityOrigin: 'https://example.com' },
        '',
        null,
      ),
    ).toBe(false);
  });

  it('refuses geolocation from our own origin', () => {
    expect(isAudioOnlyAppCheck('geolocation', undefined, 'file://', null)).toBe(false);
  });
});

describe('allowAppAudioOnly', () => {
  it('installs both handlers and answers through the rule', () => {
    const session = fakeSession();
    allowAppAudioOnly(session, 'http://localhost:5173');

    expect(session.setPermissionRequestHandler).toHaveBeenCalledTimes(1);
    expect(session.setPermissionCheckHandler).toHaveBeenCalledTimes(1);

    const callback = vi.fn();
    session.requests[0]?.(undefined, 'media', callback, {
      mediaTypes: ['audio'],
      securityOrigin: 'http://localhost:5173',
    });
    expect(callback).toHaveBeenLastCalledWith(true);

    session.requests[0]?.(undefined, 'media', callback, {
      mediaTypes: ['audio', 'video'],
      securityOrigin: 'http://localhost:5173',
    });
    expect(callback).toHaveBeenLastCalledWith(false);

    session.requests[0]?.(undefined, 'camera', callback, { securityOrigin: 'file://' });
    expect(callback).toHaveBeenLastCalledWith(false);

    expect(
      session.checks[0]?.(undefined, 'media', 'http://localhost:5173', { mediaType: 'audio' }),
    ).toBe(true);
    expect(session.checks[0]?.(undefined, 'notifications', 'file://')).toBe(false);
  });

  it('grants the packaged build its own microphone, both handlers', () => {
    const session = fakeSession();
    allowAppAudioOnly(session, null);

    const callback = vi.fn();
    session.requests[0]?.(undefined, 'media', callback, RECORDED.packagedRequest);
    expect(callback).toHaveBeenLastCalledWith(true);
    expect(
      session.checks[0]?.(undefined, 'media', RECORDED.packagedCheckOrigin, RECORDED.packagedCheck),
    ).toBe(true);
  });
});
