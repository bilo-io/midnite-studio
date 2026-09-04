import type { ForgeLabel } from '@midnite/studio-shared';

/**
 * Perceptual luma (YIQ) — enough to pick a readable text colour against an
 * arbitrary label hex without a full WCAG contrast computation, and the same
 * rule GitHub's own label chips use.
 */
function readableTextColor(hex: string): string {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#1a1a1a' : '#f5f5f5';
}

/** One issue label, as a solid-colour chip — `color` is six hex digits, no leading `#`. */
export function LabelChip({ label }: { label: ForgeLabel }) {
  if (!label.color) {
    return (
      <span
        title={label.name}
        className="max-w-[8rem] shrink-0 truncate rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground"
      >
        {label.name}
      </span>
    );
  }

  return (
    <span
      title={label.name}
      className="max-w-[8rem] shrink-0 truncate rounded-full px-1.5 py-px text-[10px] font-medium"
      style={{ backgroundColor: `#${label.color}`, color: readableTextColor(label.color) }}
    >
      {label.name}
    </span>
  );
}
