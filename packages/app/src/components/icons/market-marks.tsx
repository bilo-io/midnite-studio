import type { CSSProperties } from 'react';

/**
 * Marks for the Finance dashboard's assets that `react-icons/si` (Simple Icons)
 * does not carry — Simple Icons dropped Microsoft's and Amazon's logos, and has
 * no entry for a coin or ETF this app lists as a fallback.
 *
 * **Provenance.** Hand-drawn for this app on a 24-unit grid from plain
 * geometry — squares, a triangle, arcs, bars — and not traced from any
 * publisher's artwork. They are stylised stand-ins that read as the brand at
 * 16-32 px, in the same spirit as `circle-pile-icon.tsx`, and they take
 * `currentColor` so the dashboard can tint each with the asset's brand colour.
 * `strokeWidth` is accepted and ignored, as in every other mark here, so each
 * stays interchangeable with a `react-icons` glyph in `IconButton`/`Tooltip`.
 */

type MarkProps = { className?: string; strokeWidth?: number; style?: CSSProperties };

const Svg = ({ className, style, children }: MarkProps & { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true" focusable="false" fill="currentColor">
    {children}
  </svg>
);

/** Four squares — the Windows / Microsoft window. */
export function MicrosoftMark(props: MarkProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="2.5" width="9" height="9" rx="0.6" />
      <rect x="12.5" y="2.5" width="9" height="9" rx="0.6" />
      <rect x="2.5" y="12.5" width="9" height="9" rx="0.6" />
      <rect x="12.5" y="12.5" width="9" height="9" rx="0.6" />
    </Svg>
  );
}

/** A smile that runs into an arrow — the "a to z" swoosh, reduced to one curve. */
export function AmazonMark(props: MarkProps) {
  return (
    <Svg {...props}>
      <path d="M3.2 15.6c4.9 2.8 11.4 2.9 17.2-0.4l-0.9-1.5c-4.9 2.5-10.4 2.4-14.4 0.1z" />
      <path d="M17.6 12.2l3.9 1.2-1 3.9z" />
      <path
        fillRule="evenodd"
        d="M12 4.2a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6z"
      />
    </Svg>
  );
}

/** A triangle with a notch — the peak. */
export function AvalancheMark(props: MarkProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.2 22 20.4h-6.2L12 13.9 8.2 20.4H2z" />
      <path d="M12 3.2l3.3 5.7h-6.6z" opacity="0.55" />
    </Svg>
  );
}

/** Rising bars over a baseline — a broad-market index fund. */
export function IndexFundMark(props: MarkProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="13" width="3.6" height="7.5" rx="0.8" />
      <rect x="8.2" y="9" width="3.6" height="11.5" rx="0.8" />
      <rect x="13.4" y="11" width="3.6" height="9.5" rx="0.8" />
      <rect x="18.6" y="4.5" width="2.8" height="16" rx="0.8" />
    </Svg>
  );
}

/** A ring with a tail — the Q. */
export function TechFundMark(props: MarkProps) {
  return (
    <Svg {...props}>
      <path
        fillRule="evenodd"
        d="M11.5 2.8a8.7 8.7 0 1 0 5.3 15.6l3 2.6 1.4-1.6-2.9-2.5A8.7 8.7 0 0 0 11.5 2.8zm0 3.2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z"
      />
    </Svg>
  );
}
