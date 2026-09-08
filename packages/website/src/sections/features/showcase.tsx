import { assetHref } from '../../routes';

/**
 * The screenshot pair, cropped by CSS rather than by a second file.
 *
 * There is one real screenshot of the app in the site's `public/` tree, in a
 * dark and a light version (`img/app-showcase/multi-screen-vertical-*.png`),
 * and this shows a detail of it: `object-cover` scales it to the strip's width,
 * `objectPosition` chooses which horizontal band of the window that is, and the
 * scale zooms in on the same point so the band is a readable detail instead of
 * a squashed overview. No cropped derivative is committed, so there is exactly
 * one screenshot to keep current when the UI moves.
 *
 * **Theme comes from `<picture>`, not from a class.** The site has no in-page
 * theme switch — it follows `prefers-color-scheme` through the tokens — so the
 * light source is selected by the same media query the tokens use, and only the
 * matching file is ever fetched. `loading="lazy"` keeps that fetch off the
 * critical path: this strip is well below the fold.
 */
export const Showcase = () => (
  <figure className="mt-12 sm:mt-16">
    <div className="overflow-hidden rounded-lg shadow-glow-soft">
      <div className="aspect-[16/7] w-full">
        <picture>
          <source
            media="(prefers-color-scheme: light)"
            srcSet={assetHref('img/app-showcase/multi-screen-vertical-light.png')}
          />
          <img
            src={assetHref('img/app-showcase/multi-screen-vertical-dark.png')}
            alt="Midnite Studio's commit graph beside a sidebar of repositories with their worktrees nested underneath, branch lanes in four colours."
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
            style={{ objectPosition: '50% 12%', transformOrigin: '50% 12%', transform: 'scale(1.25)' }}
          />
        </picture>
      </div>
    </div>
    <figcaption className="mt-3 text-sm text-fg-subtle">
      The graph and the worktree sidebar, on this repository. Everything on this page is a
      screenshot or a description of what is already built.
    </figcaption>
  </figure>
);
