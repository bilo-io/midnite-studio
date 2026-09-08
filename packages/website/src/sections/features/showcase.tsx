import { assetHref } from '../../routes';
import { useResolvedTheme } from '../../theme';

/*
  The crop, and why it is arithmetic rather than `object-position`.

  There is one real screenshot of the app in the site's `public/` tree, in a
  dark and a light version (`img/app-showcase/multi-screen-vertical-*.png`,
  1080 x 1920), and this strip shows a detail of it: the commit graph itself. No cropped derivative is committed, so there is exactly one
  screenshot to keep current when the UI moves.

  `object-position` alone cannot express that crop. The source is portrait and
  the strip is landscape, so under `object-fit: cover` the image is scaled until
  its *width* matches the box — which leaves nothing to slide horizontally, and
  the only axis `object-position` can then choose on is the vertical one. The
  region wanted here is horizontal: the right two-thirds of the window, past the
  gap between the detached panel and the sidebar.

  So the image is sized and offset in percentages of the frame instead, which is
  the same crop stated exactly and stays responsive, because every number below
  is relative to the frame's own width.

    source            1080 x 1920
    region wanted     x 368..1080, y 105..580   (712 x 475, ~3:2)
    image width       1080/712              = 151.7% of the frame
    image height      151.7% x 1920/1080    = 269.7% of the frame's width
    left              -(368/1080) x 151.7%  = -51.7%
    top               -(105/1920) x 269.7%  = -14.7%

  **Theme comes from `useResolvedTheme()`, not a `<picture media>` source.**
  The nav's theme toggle (`components/theme-toggle.tsx`) can override the OS
  preference, and a `prefers-color-scheme` media query on a `<source>` has no
  way to hear that override — only the hook's `system` branch consults the OS
  at all. `loading="lazy"` keeps the fetch off the critical path: this strip is
  well below the fold and the file is ~0.5 MB.
*/

const CROP = {
  width: '151.7%',
  height: '269.7%',
  left: '-51.7%',
  top: '-14.7%',
  maxWidth: 'none',
} as const;

export const Showcase = () => {
  const theme = useResolvedTheme();
  const src =
    theme === 'light'
      ? 'img/app-showcase/multi-screen-vertical-light.png'
      : 'img/app-showcase/multi-screen-vertical-dark.png';

  return (
    <figure className="mt-12 sm:mt-16">
      <div className="relative aspect-[3/2] w-full overflow-hidden rounded-lg shadow-glow-soft">
        <img
          src={assetHref(src)}
          alt="Midnite Studio's commit graph: four columns of coloured branch lanes, branch and tag badges pinned to the commits they point at, and the commit subjects, dates and SHAs beside them."
          loading="lazy"
          decoding="async"
          className="absolute"
          style={CROP}
        />
      </div>
      <figcaption className="mt-3 text-sm text-fg-subtle">
        The commit graph, on this repository. Everything on this page is a screenshot of the
        app or a description of something already built.
      </figcaption>
    </figure>
  );
};
