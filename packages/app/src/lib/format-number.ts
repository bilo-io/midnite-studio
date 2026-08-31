/**
 * Formats a number with comma thousands separators (en-US locale).
 *
 * Used across the app to format line diffs, file counts, commit totals,
 * and other numeric quantities consistently with standard comma separators.
 */
export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}
