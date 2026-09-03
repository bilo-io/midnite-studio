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
  BLUE: '#3B82F6',
  GREEN: '#22C55E',
  YELLOW: '#EAB308',
  ORANGE: '#F97316',
  RED: '#EF4444',
  PINK: '#EC4899',
  PURPLE: '#A855F7',
};

/** Muted-foreground grey for an option GitHub sent with no colour (or none selected). */
const NEUTRAL = '#8B8B95';

export function fieldOptionColor(color: string): string {
  return SWATCH[color] ?? NEUTRAL;
}
