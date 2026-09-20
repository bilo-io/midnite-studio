/**
 * Content-Security-Policy for the app's own renderer documents.
 *
 * Installed on `session.defaultSession` only — the `persist:browser` partition
 * keeps its own policy in `browser-security.ts`. Pure builders here so
 * `csp.test.ts` and the Vite dev-server middleware can share one string.
 */

export type CspBuildOptions = {
  /** When true, widen `script-src` and `connect-src` for Vite HMR. */
  dev: boolean;
  /** Required when `dev` is true — e.g. `http://localhost:5173`. */
  devServerOrigin?: string | null;
};

function normaliseOrigin(raw: string): string {
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

/** Builds the CSP header value for the app renderer. */
export function buildCsp(opts: CspBuildOptions): string {
  const scriptSrc = ["'self'"];
  const connectSrc = [
    "'self'",
    'mstudio-file:',
    'https://api.open-meteo.com',
    'https://geocoding-api.open-meteo.com',
    'https://ipwho.is',
  ];

  if (opts.dev && opts.devServerOrigin) {
    const origin = normaliseOrigin(opts.devServerOrigin);
    scriptSrc.push(origin);
    connectSrc.push(origin, origin.replace(/^http:/, 'ws:'));
  }

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: mstudio-file: https:",
    "media-src 'self' blob: mstudio-file:",
    "font-src 'self' data:",
    "worker-src 'self' blob: data:",
    `connect-src ${connectSrc.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export type HeadersReceivedDetails = {
  url: string;
  responseHeaders?: Record<string, string | string[]>;
  resourceType?: string;
};

export type HeadersReceivedSession = {
  webRequest: {
    onHeadersReceived(
      filter: { urls: string[] },
      listener: (
        details: HeadersReceivedDetails,
        callback: (response: { responseHeaders?: Record<string, string | string[]> }) => void,
      ) => void,
    ): void;
  };
};

/** URL patterns for app renderer documents (not embedded browser pages). */
export function appDocumentUrlPatterns(devServerOrigin: string | null): string[] {
  const patterns = ['file://*/*'];
  if (devServerOrigin !== null) {
    try {
      patterns.push(`${new URL(devServerOrigin).origin}/*`);
    } catch {
      // Unreachable in production — devServerOrigin is always a valid URL when set.
    }
  }
  return patterns;
}

export type InstallCspOptions = {
  dev: boolean;
  devServerOrigin: string | null;
};

/** Adds a Content-Security-Policy header to main-frame app document responses. */
export function installCsp(session: HeadersReceivedSession, opts: InstallCspOptions): void {
  const csp = buildCsp({
    dev: opts.dev,
    devServerOrigin: opts.devServerOrigin ?? undefined,
  });
  const urls = appDocumentUrlPatterns(opts.devServerOrigin);

  session.webRequest.onHeadersReceived({ urls }, (details, callback) => {
    if (details.resourceType !== undefined && details.resourceType !== 'mainFrame') {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }

    const headers = { ...(details.responseHeaders ?? {}) };
    headers['Content-Security-Policy'] = [csp];
    callback({ responseHeaders: headers });
  });
}
