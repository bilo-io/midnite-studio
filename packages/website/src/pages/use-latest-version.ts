/**
 * What a published build's version looks like to the page. Access is gated, so
 * the site no longer reads any public release feed: there is no network call
 * and no public version to show. The type stays because the Apps page's pills
 * and carousel are written against it.
 */
export type VersionState =
  /** A version is known. Not produced while access is gated. */
  | { status: 'released'; version: string }
  /** No public release — the honest state while access is invitation-only. */
  | { status: 'unreleased' }
  | { status: 'loading' }
  | { status: 'unavailable' };

const UNRELEASED: VersionState = { status: 'unreleased' };

/** Always `unreleased`; kept as a hook, taking the product, so call sites need not change. */
export const useLatestVersion = (product?: 'midnite-launcher' | 'midnite-studio'): VersionState => {
  void product;
  return UNRELEASED;
};
