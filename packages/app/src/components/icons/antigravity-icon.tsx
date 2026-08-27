import { useId, type CSSProperties } from 'react';

/**
 * Antigravity's mark, as a local SVG.
 *
 * **Provenance.** This is the real mark now, not an approximation of one. It is
 * the same artwork the sibling Midnite app ships at
 * `packages/web/public/agent-logos/antigravity.svg`, taken from
 * [lobe-icons](https://github.com/lobehub/lobe-icons) (MIT), and the earlier
 * version in this file — a blunt arrow leaving a ground line — was a hand-drawn
 * stand-in that read as *a* rocket rather than as *this product*. `INITIAL_PLAN.md`
 * asks that a third-party asset's licence be written down where the asset lands:
 * lobe-icons is MIT, reproduced here with that notice, and "Antigravity" and its
 * logo remain Google's trademarks, used nominatively to name the agent this row
 * launches.
 *
 * **Why it is built this way.** The artwork is not a silhouette — it is eleven
 * heavily blurred colour fields clipped to the peak outline, which is how it gets
 * the Google-gradient wash instead of a flat fill. So the component is two data
 * tables (`BLOBS`, `BLURS`) mapped into `<g>`/`<filter>` elements rather than
 * forty lines of near-identical JSX; the numbers are the asset, and keeping them
 * as numbers is what makes a re-import from upstream a diff of digits.
 *
 * `BLOBS[2]` and `BLOBS[3]` are the same path behind the same blur. That
 * duplication is in the upstream file, and it is load-bearing: the blur leaves
 * semi-transparent edges, so compositing the green twice is what gives that lobe
 * its density. Collapsing them would tidy the code and change the picture.
 *
 * **The one API difference from its siblings.** `ClaudeIcon` and `CodexIcon` fill
 * with `currentColor`, which is what lets the session list tint them with the
 * agent's accent. This mark carries its own colours and cannot be tinted — a
 * multi-colour brand logo has no single colour to override. `style` is still
 * accepted and still applied, so a caller mapping over a list of icons needs no
 * special case; it simply has no visible effect on the fills. `strokeWidth` is
 * accepted and ignored, as in the other marks.
 *
 * The mask and filter ids are scoped with `useId`, because ids in an inline SVG
 * are document-global: two sessions in the list means two copies of this mark in
 * one DOM, and hard-coded ids would have every copy resolving its `url(#…)`
 * references against the first one's `<defs>`.
 */
export function AntigravityIcon({
  className,
  style,
}: {
  className?: string;
  strokeWidth?: number;
  /**
   * Applied, but the mark's own colours win — see the note above. Kept so the
   * component stays interchangeable with the tintable marks.
   */
  style?: CSSProperties;
}) {
  /* `useId` emits colons, which are legal in an id but awkward in a `url(#…)`. */
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const maskId = `antigravity-mask-${uid}`;
  const blurId = (id: number) => `antigravity-blur-${id}-${uid}`;

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="1" width="24" height="23">
        <path d={SILHOUETTE} fill="#fff" />
      </mask>
      <g mask={`url(#${maskId})`}>
        {BLOBS.map((blob) => (
          /* Keyed by its blur, which is one-per-field and so already unique. */
          <g key={blob.blur} filter={`url(#${blurId(blob.blur)})`}>
            <path d={blob.d} fill={blob.fill} />
          </g>
        ))}
      </g>
      <defs>
        {BLURS.map((blur) => (
          <filter
            key={blur.id}
            id={blurId(blur.id)}
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
            x={blur.x}
            y={blur.y}
            width={blur.width}
            height={blur.height}
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
            <feGaussianBlur stdDeviation={blur.std} result="blur" />
          </filter>
        ))}
      </defs>
    </svg>
  );
}

/** The peak outline every colour field is clipped to — the mark's actual shape. */
const SILHOUETTE =
  'M21.751 22.607c1.34 1.005 3.35.335 1.508-1.508C17.73 15.74 18.904 1 12.037 1 5.17 1 6.342 15.74.815 21.1c-2.01 2.009.167 2.511 1.507 1.506 5.192-3.517 4.857-9.714 9.715-9.714 4.857 0 4.522 6.197 9.714 9.715z';

/**
 * The colour fields, in paint order. Most sit largely *outside* the 24×24 box —
 * only the part the mask keeps is ever seen, which is why the coordinates look
 * wrong until you remember they are being clipped to the peak.
 */
const BLOBS: ReadonlyArray<{ blur: number; fill: string; d: string }> = [
  {
    blur: 1,
    fill: '#FFE432',
    d: 'M-1.018-3.992c-.408 3.591 2.686 6.89 6.91 7.37 4.225.48 7.98-2.043 8.387-5.633.408-3.59-2.686-6.89-6.91-7.37-4.225-.479-7.98 2.043-8.387 5.633z',
  },
  {
    blur: 2,
    fill: '#FC413D',
    d: 'M15.269 7.747c1.058 4.557 5.691 7.374 10.348 6.293 4.657-1.082 7.575-5.653 6.516-10.21-1.058-4.556-5.691-7.374-10.348-6.292-4.657 1.082-7.575 5.653-6.516 10.21z',
  },
  {
    blur: 3,
    fill: '#00B95C',
    d: 'M-12.443 10.804c1.338 4.703 7.36 7.11 13.453 5.378 6.092-1.733 9.947-6.95 8.61-11.652C8.282-.173 2.26-2.58-3.833-.848-9.925.884-13.78 6.1-12.443 10.804z',
  },
  {
    blur: 4,
    fill: '#00B95C',
    d: 'M-12.443 10.804c1.338 4.703 7.36 7.11 13.453 5.378 6.092-1.733 9.947-6.95 8.61-11.652C8.282-.173 2.26-2.58-3.833-.848-9.925.884-13.78 6.1-12.443 10.804z',
  },
  {
    blur: 5,
    fill: '#00B95C',
    d: 'M-7.608 14.703c3.352 3.424 9.126 3.208 12.896-.483 3.77-3.69 4.108-9.459.756-12.883C2.69-2.087-3.083-1.871-6.853 1.82c-3.77 3.69-4.108 9.458-.755 12.883z',
  },
  {
    blur: 6,
    fill: '#3186FF',
    d: 'M9.932 27.617c1.04 4.482 5.384 7.303 9.7 6.3 4.316-1.002 6.971-5.448 5.93-9.93-1.04-4.483-5.384-7.304-9.7-6.301-4.316 1.002-6.971 5.448-5.93 9.93z',
  },
  {
    blur: 7,
    fill: '#FBBC04',
    d: 'M2.572-8.185C.392-3.329 2.778 2.472 7.9 4.771c5.122 2.3 11.042.227 13.222-4.63 2.18-4.855-.205-10.656-5.327-12.955-5.122-2.3-11.042-.227-13.222 4.63z',
  },
  {
    blur: 8,
    fill: '#3186FF',
    d: 'M-3.267 38.686c-5.277-2.072 3.742-19.117 5.984-24.83 2.243-5.712 8.34-8.664 13.616-6.592 5.278 2.071 11.533 13.482 9.29 19.195-2.242 5.713-23.613 14.298-28.89 12.227z',
  },
  {
    blur: 9,
    fill: '#749BFF',
    d: 'M28.71 17.471c-1.413 1.649-5.1.808-8.236-1.878-3.135-2.687-4.531-6.201-3.118-7.85 1.412-1.649 5.1-.808 8.235 1.878s4.532 6.2 3.119 7.85z',
  },
  {
    blur: 10,
    fill: '#FC413D',
    d: 'M18.163 9.077c5.81 3.93 12.502 4.19 14.946.577 2.443-3.612-.287-9.727-6.098-13.658-5.81-3.931-12.502-4.19-14.946-.577-2.443 3.612.287 9.727 6.098 13.658z',
  },
  {
    blur: 11,
    fill: '#FFEE48',
    d: 'M-.915 2.684c-1.44 3.473-.97 6.967 1.05 7.804 2.02.837 4.824-1.3 6.264-4.772 1.44-3.473.97-6.967-1.05-7.804-2.02-.837-4.824 1.3-6.264 4.772z',
  },
];

/**
 * One blur per colour field. The generous `stdDeviation` values are the whole
 * effect — unblurred, the artwork is eleven hard-edged lozenges.
 */
const BLURS: ReadonlyArray<{
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  std: number;
}> = [
  { id: 1, x: -3.288, y: -11.917, width: 19.838, height: 17.587, std: 1.117 },
  { id: 2, x: 4.251, y: -13.493, width: 38.9, height: 38.565, std: 5.4 },
  { id: 3, x: -21.889, y: -10.592, width: 40.955, height: 36.517, std: 4.591 },
  { id: 4, x: -21.889, y: -10.592, width: 40.955, height: 36.517, std: 4.591 },
  { id: 5, x: -19.099, y: -10.278, width: 36.632, height: 36.595, std: 4.591 },
  { id: 6, x: 0.981, y: 8.758, width: 33.533, height: 34.087, std: 4.363 },
  { id: 7, x: -6.143, y: -21.659, width: 35.978, height: 35.276, std: 3.954 },
  { id: 8, x: -11.96, y: -0.46, width: 45.114, height: 46.523, std: 3.531 },
  { id: 9, x: 10.485, y: 0.58, width: 25.094, height: 24.054, std: 3.159 },
  { id: 10, x: 5.833, y: -12.467, width: 33.508, height: 30.007, std: 2.669 },
  { id: 11, x: -8.355, y: -8.876, width: 22.194, height: 26.151, std: 3.303 },
];
