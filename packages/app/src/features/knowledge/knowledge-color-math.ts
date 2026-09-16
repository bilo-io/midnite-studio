/**
 * `styles.css`'s tokens are HSL triples, and CSS itself is fine with an
 * `hsl(...)` string anywhere — but sigma's WebGL colour parser is not: it
 * recognises only `#hex` and `rgb()`/`rgba()` (verified against sigma
 * 3.0.3's own `parseColor`, `node_modules/sigma/dist/colors-*.js` — an
 * `hsl()` string it doesn't recognise silently parses to black, r=g=b=0,
 * which is exactly the all-black canvas this function exists to prevent).
 * So every colour handed to sigma converts through here first.
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.min(1, Math.max(0, s / 100));
  const light = Math.min(1, Math.max(0, l / 100));

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;

  let [r1, g1, b1] = [0, 0, 0];
  if (hue < 60) [r1, g1, b1] = [c, x, 0];
  else if (hue < 120) [r1, g1, b1] = [x, c, 0];
  else if (hue < 180) [r1, g1, b1] = [0, c, x];
  else if (hue < 240) [r1, g1, b1] = [0, x, c];
  else if (hue < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
}

/** `hslToRgb`, formatted as the `rgb(r, g, b)` string sigma's colour parser actually understands. */
export function hslTripleToRgbString(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(h, s, l);
  return `rgb(${r}, ${g}, ${b})`;
}
