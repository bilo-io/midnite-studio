/**
 * GitHub's own ProjectV2 single-select colour names, as a hex swatch.
 *
 * `ForgeProjectFieldOption.color` carries GitHub's colour verbatim (`BLUE`,
 * `GREEN`, …) rather than a CSS value — it's a label from their API, not a
 * paint instruction — so this is the one place that turns it into one. Inline
 * hex rather than Tailwind class names: this app is Electron-only (Chromium,
 * always), so a `<select>`/`<option>` can be painted directly with `style`,
 * and a fixed swatch survives Tailwind's content scan whether or not the
 * class string is literal anywhere.
 *
 * Approximate GitHub swatch values — close enough to read as "the same
 * colour GitHub shows", not a pixel-exact match to their design tokens.
 */
const SWATCH: Readonly<Record<string, string>> = {
  GRAY: '#9CA3AF',
  DARK_GRAY: '#6B7280',
  BLUE: '#3B82F6',
  GREEN: '#22C55E',
  YELLOW: '#EAB308',
  ORANGE: '#F97316',
  RED: '#EF4444',
  PINK: '#EC4899',
  PURPLE: '#A855F7',
  TEAL: '#14B8A6',
  LIME: '#84CC16',
};

/**
 * Status name fallbacks for when an option's colour is not explicitly provided.
 * Maps common status values to standard GitHub option colours.
 *
 * Phase 95 Theme A left this literal rather than sourcing it from
 * `shared/src/activity-palette.ts`, on purpose: every built-in preset's
 * semantic statuses resolve through `hsl(var(--success))` /
 * `hsl(var(--destructive))` / etc (Decision, Brand preset: "theme-derived
 * solids elsewhere"), and `fieldOptionChipStyle` below builds its background
 * tint and border by string-concatenating an alpha suffix onto a *hex*
 * (`${hex}1A`) — `"hsl(var(--success))1A"` is not a colour. A GitHub
 * "DONE"/"IN PROGRESS" board-column name is also a lifecycle label, not a
 * live run state; collapsing it onto `ActivityStatus` would still need a
 * concrete hex to survive this concatenation, so there is nothing this
 * migration could move without inventing a second, hex-only shadow palette
 * — left as its own map for the same reason `loop-glow.ts`'s `LOOP_GLOW`
 * stays its own map (see that file's comment).
 */
const STATUS_FALLBACKS: Readonly<Record<string, string>> = {
  DONE: '#22C55E',
  CLOSED: '#22C55E',
  COMPLETE: '#22C55E',
  COMPLETED: '#22C55E',
  'IN PROGRESS': '#3B82F6',
  PROGRESS: '#3B82F6',
  DOING: '#3B82F6',
  'IN REVIEW': '#A855F7',
  REVIEW: '#A855F7',
  TODO: '#9CA3AF',
  'TO DO': '#9CA3AF',
  BACKLOG: '#9CA3AF',
};

/** Muted-foreground grey for an option GitHub sent with no colour (or none selected). */
const NEUTRAL = '#8B8B95';

export function fieldOptionColor(colorOrName: string | undefined | null): string {
  if (!colorOrName) return NEUTRAL;
  const trimmed = colorOrName.trim();
  if (trimmed.startsWith('#')) return trimmed;
  const upper = trimmed.toUpperCase();
  if (SWATCH[upper]) return SWATCH[upper];
  if (STATUS_FALLBACKS[upper]) return STATUS_FALLBACKS[upper];
  return NEUTRAL;
}

export interface FieldOptionChipStyle {
  color: string;
  backgroundColor: string;
  borderColor: string;
}

/**
 * Produces the background tint (with opacity), border colour and text/dot colour
 * for a GitHub single-select chip.
 */
export function fieldOptionChipStyle(colorOrName: string | undefined | null): FieldOptionChipStyle {
  const hex = fieldOptionColor(colorOrName);
  return {
    color: hex,
    backgroundColor: `${hex}1A`,
    borderColor: `${hex}55`,
  };
}
