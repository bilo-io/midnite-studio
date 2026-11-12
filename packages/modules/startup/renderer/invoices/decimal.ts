/** `"1,250.5"` to `125050` at 2 places, by splitting the decimal point as a string; never multiplies a float. `null` when it is not a plain non-negative number or has too many decimals. */
export function decimalToInt(text: string, places: number): number | null {
  const body = text.trim().replace(/,/g, '');
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(body)) return null;
  const [whole = '', fraction = ''] = body.split('.');
  if (fraction.length > places) return null;
  const value = Number(`${whole === '' ? '0' : whole}${fraction.padEnd(places, '0')}`);
  return Number.isSafeInteger(value) ? value : null;
}

/** The editable text of an integer at `places` decimals: `125050` is `"1250.50"`, and trailing zeros of a quantity are dropped by the caller. */
export function intToDecimal(value: number, places: number): string {
  if (places === 0) return String(value);
  const digits = String(Math.abs(value)).padStart(places + 1, '0');
  return `${value < 0 ? '-' : ''}${digits.slice(0, -places)}.${digits.slice(-places)}`;
}
