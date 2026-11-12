/** A "nice" step (1, 2 or 5 times a power of ten) near `raw`. */
function niceStep(raw: number): number {
  const exp = Math.floor(Math.log10(raw));
  const f = raw / 10 ** exp;
  const nice = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  return nice * 10 ** exp;
}

/** Y ticks covering `[min, max]` at 1/2/5 x 10^n steps, aiming for about 5 (4 to 6 in practice). */
export function niceTicks(min: number, max: number, target = 5): number[] {
  if (!(max > min)) {
    const base = Math.floor(min);
    return [base, base + 1];
  }
  const step = niceStep((max - min) / (target - 1));
  const first = Math.floor(min / step + 1e-9) * step;
  const last = Math.ceil(max / step - 1e-9) * step;
  const out: number[] = [];
  for (let v = first; v <= last + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}
