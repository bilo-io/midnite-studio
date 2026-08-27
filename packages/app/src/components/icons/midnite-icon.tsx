/**
 * The midnite mark, as a monochrome SVG.
 *
 * `brand.tsx` renders the same mark from `logo.png`, and deliberately so — it
 * is an *opaque* asset, a black crescent on a white ground, which is what lets
 * one file sit on both themes without inverting. That is exactly wrong for a
 * toolbar glyph: a control's icon has to take the colour of the control, and a
 * PNG cannot. So the mark is traced here instead, in one path, drawn in
 * `currentColor` on a transparent ground like every other icon in the row.
 *
 * The path was fitted to `logo.png` rather than eyeballed: the disc, the ring
 * and the crescent's two arcs are least-squares circles through the asset's own
 * edge pixels (r=465 and r=512 about the centre; r=297 and r=220 for the
 * crescent), and the crescent's hooked horns — which are not circular — are the
 * traced outline, simplified to 2px on the 1024 canvas. Rasterising the result
 * back agrees with the PNG everywhere except its antialiased edges.
 *
 * ## Why one path with four subpaths
 *
 * The mark inverts across its own equator: the top half is a filled disc with
 * the crescent knocked out of it, the bottom half is a hairline ring with the
 * crescent filled in. Two clipped groups would say that most directly, but
 * clipping needs an `id`, and an `id` in an inlined SVG collides with every
 * other copy of itself on the page.
 *
 * So it is one `evenodd` path, and the four subpaths are chosen so that the
 * crossing count lands odd exactly on the ink:
 *
 * | region                     | disc-512 | disc-465 | top half | crescent | = |
 * | -------------------------- | -------- | -------- | -------- | -------- | - |
 * | outside the mark           |          |          |          |          | 0 |
 * | top, in the ring band      | ✓        |          | ✓        |          | 2 |
 * | top, inside, off crescent  | ✓        | ✓        | ✓        |          | 3 |
 * | top, on the crescent       | ✓        | ✓        | ✓        | ✓        | 4 |
 * | bottom, in the ring band   | ✓        |          |          |          | 1 |
 * | bottom, inside, off cresc. | ✓        | ✓        |          |          | 2 |
 * | bottom, on the crescent    | ✓        | ✓        |          | ✓        | 3 |
 *
 * The third subpath is a *semicircle* rather than a rectangle for the same
 * reason: a half-plane would keep toggling past the disc's edge and fill the
 * whole top of the viewBox.
 *
 * Typed to the app's structural `IconComponent` (`className` + `strokeWidth`),
 * like `claude-icon.tsx` next door, so it drops into `IconButton` and the
 * context menus beside a lucide or react-icons glyph. `strokeWidth` is accepted
 * and ignored: the mark is filled, not stroked.
 */
export function MidniteIcon({ className }: { className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      className={className}
      fill="currentColor"
      fillRule="evenodd"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M0 512A512 512 0 1 1 1024 512A512 512 0 1 1 0 512Z
           M47 512A465 465 0 1 1 977 512A465 465 0 1 1 47 512Z
           M0 512A512 512 0 0 1 1024 512Z
           M551 222A297 297 0 0 1 532 803L494 805L463 802L427 794L387 779L359 764L323 738L293 709L278 690L315 711L342 720L370 725L408 725L419 723A219.7 219.7 0 0 0 461 310L441 303L414 298L371 298L348 302L321 311L284 331L299 312L323 288L367 256L414 234L445 225L473 220L517 218Z"
      />
    </svg>
  );
}
