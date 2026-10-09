import type { CSSProperties } from 'react';

/**
 * Small local marks for the setup wizard's tools that `react-icons` carries no
 * brand glyph for — OrbStack, ripgrep and jq. Same shape as
 * `circle-pile-icon.tsx`: a local SVG satisfying the structural `IconComponent`
 * type, tinted by `currentColor` so the row's brand colour paints it.
 *
 * **Provenance.** Original, simplified marks drawn for this app (an orb, and
 * `rg` / `jq` monograms in the tools' own spelling) — not the vendors' logo
 * artwork, which no icon set we depend on ships. They name the tool at a glance
 * without reproducing a trademark's exact lettering.
 */
interface MarkProps {
  className?: string;
  strokeWidth?: number | string;
  style?: CSSProperties;
}

const base = {
  viewBox: '0 0 24 24',
  'aria-hidden': true,
  focusable: 'false',
} as const;

export function OrbStackIcon({ className, style }: MarkProps) {
  return (
    <svg {...base} className={className} style={style} fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Monogram({ text, className, style }: MarkProps & { text: string }) {
  return (
    <svg {...base} className={className} style={style} fill="currentColor">
      <rect x="2" y="4" width="20" height="16" rx="4" opacity="0.18" />
      <text
        x="12"
        y="15.5"
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        fontFamily="ui-monospace, monospace"
      >
        {text}
      </text>
    </svg>
  );
}

export function RipgrepIcon(props: MarkProps) {
  return <Monogram text="rg" {...props} />;
}

export function JqIcon(props: MarkProps) {
  return <Monogram text="jq" {...props} />;
}
