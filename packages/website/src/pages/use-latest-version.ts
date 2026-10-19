import { useEffect, useState } from 'react';

/**
 * A product's update feed in the public releases repo. The site installs Midnite Apps (the
 * launcher), which installs the apps, so `midnite-launcher` is the default and the version the
 * download page shows. The Apps page reads `midnite-studio`'s, because every app runs inside
 * Studio today and that is the version a visitor would actually be running.
 *
 * Deliberately this file and not `releases/latest`: `bilo-io/midnite-apps`
 * distributes several apps, so its newest release is whichever one shipped most
 * recently and is not necessarily this one. The installer resolves the version
 * the same way, from the same URL — see the header of `install.sh` there.
 */
export type FeedProduct = 'midnite-launcher' | 'midnite-studio';

export const feedUrl = (product: FeedProduct): string =>
  `https://raw.githubusercontent.com/bilo-io/midnite-apps/main/${product}/version.json`;

export type VersionState =
  /** The fetch is in flight. */
  | { status: 'loading' }
  /** The feed answered with a version. */
  | { status: 'released'; version: string }
  /**
   * The feed answered, and `version` is `null` — which is its honest state
   * until the first release is cut, not an error.
   */
  | { status: 'unreleased' }
  /** The feed could not be reached, or did not parse. */
  | { status: 'unavailable' };

/**
 * Reads the published version, and never blocks the page on it.
 *
 * Every failure mode collapses to a state the page can render as prose: offline
 * is `unavailable` (the install command still works, so the page says
 * "latest"), and a feed whose `version` is `null` is `unreleased` — which is
 * the truth today and must not be dressed up as a version number.
 *
 * Aborted on unmount so a slow response cannot set state on a gone component.
 */
export const useLatestVersion = (product: FeedProduct = 'midnite-launcher'): VersionState => {
  const [state, setState] = useState<VersionState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(feedUrl(product), {
          signal: controller.signal,
          cache: 'no-cache',
        });
        if (!response.ok) throw new Error(`feed responded ${response.status}`);
        const body: unknown = await response.json();
        const version =
          typeof body === 'object' && body !== null && 'version' in body
            ? (body as { version: unknown }).version
            : null;
        setState(
          typeof version === 'string' && version.length > 0
            ? { status: 'released', version }
            : { status: 'unreleased' },
        );
      } catch {
        if (!controller.signal.aborted) setState({ status: 'unavailable' });
      }
    })();

    return () => controller.abort();
  }, [product]);

  return state;
};
