/** How many minor-unit digits a currency has: yen has none, nearly everything else two. */
export function minorExponent(currency: string): number {
  return currency === 'JPY' ? 0 : 2;
}

/** `"1,250.50"` in a currency to integer minor units, or `null` when it is not a plain number. */
export function toMinor(text: string, currency: string): number | null {
  const cleaned = text.trim().replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 10 ** minorExponent(currency));
}

/** Integer minor units to the editable text of an amount (`125050` is `"1250.50"`). */
export function fromMinor(minor: number, currency: string): string {
  const exponent = minorExponent(currency);
  return exponent === 0 ? String(minor) : (minor / 10 ** exponent).toFixed(exponent);
}
