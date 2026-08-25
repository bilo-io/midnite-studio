/**
 * `"240 10% 3.9%"` — a design token's raw HSL triple — to `#rrggbb`.
 *
 * Needed because Electron's `setBackgroundColor` takes a hex string while the
 * tokens are stored as bare HSL components (that's what makes
 * `hsl(var(--background) / 50%)` work in CSS). There is no way to ask the
 * browser to convert one to the other without painting something and reading it
 * back, so the conversion lives here.
 */
export function hslTokenToHex(token: string): string {
  const [h = '0', s = '0%', l = '0%'] = token.trim().split(/\s+/);
  const hue = ((Number.parseFloat(h) % 360) + 360) % 360;
  const sat = clamp01(Number.parseFloat(s) / 100);
  const light = clamp01(Number.parseFloat(l) / 100);

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;

  const sector = Math.floor(hue / 60) % 6;
  const rgb = SECTORS[sector] ?? [0, 0, 0];
  const [r, g, b] = rgb.map((component) => (component === 1 ? c : component === 2 ? x : 0)) as [
    number,
    number,
    number,
  ];

  return `#${channel(r + m)}${channel(g + m)}${channel(b + m)}`;
}

/** Which of (c, x, 0) each RGB channel takes, per 60° sector. 1 = c, 2 = x, 0 = 0. */
const SECTORS: readonly (readonly [number, number, number])[] = [
  [1, 2, 0],
  [2, 1, 0],
  [0, 1, 2],
  [0, 2, 1],
  [2, 0, 1],
  [1, 0, 2],
];

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

const channel = (value: number): string =>
  Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16)
    .padStart(2, '0');
