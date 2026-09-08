import { assetHref } from '../routes';

import { Wordmark } from './wordmark';

export type LogoProps = {
  /** Pixel size of the mark. The wordmark scales with it. */
  size?: number;
  /** Hides the wordmark, leaving the crescent alone. */
  markOnly?: boolean;
  className?: string;
};

/**
 * The crescent and the wordmark.
 *
 * The mark is `public/img/logo.png`, a copy of the app's own
 * `packages/desktop/resources/icon.png` — a copy rather than a build-time
 * reference, because the site is built and deployed on its own and must not
 * reach across a package boundary for an asset.
 *
 * It is a solid black silhouette on transparency, so `.ws-logo-mark`
 * (`styles/site.css`) inverts it under the dark theme and leaves it alone under
 * the light one. That is exactly right for a one-colour shape and saves
 * maintaining two files that must never drift apart.
 *
 * The wordmark beside it is `<Wordmark>`, which owns the brand-face/UI-face
 * split and the rainbow-and-glow treatment. It is not spelled out here: the
 * hero and the footer render the same mark, and the nav's `aria-label` is what
 * announces "Midnite Studio" to a screen reader either way.
 */
export const Logo = ({ size = 28, markOnly = false, className = '' }: LogoProps) => (
  <span className={`inline-flex items-center gap-2.5 ${className}`}>
    <img
      src={assetHref('img/logo.png')}
      alt=""
      width={size}
      height={size}
      className="ws-logo-mark select-none"
      draggable={false}
    />
    {markOnly ? null : <Wordmark className="text-[0.95rem] tracking-tight text-fg" />}
  </span>
);
