/** Hand-written CSV reader for bank statements: RFC 4180 quoting, BOM, CRLF/LF, a sniffed delimiter. */

export type CsvDelimiter = ',' | ';' | '\t';
export type ParsedCsv = { rows: string[][]; delimiter: CsvDelimiter };

export const CSV_MAX_BYTES = 5 * 1024 * 1024;
export const CSV_MAX_ROWS = 20_000;

const DELIMITERS: readonly CsvDelimiter[] = [',', ';', '\t'];

/** The most frequent of `,` `;` tab outside quotes on the first non-empty line (ties favour the earlier in that list). */
function sniffDelimiter(text: string): CsvDelimiter {
  const counts: Record<CsvDelimiter, number> = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  let seenContent = false;
  for (const ch of text) {
    if (ch === '"') {
      quoted = !quoted;
      seenContent = true;
    } else if (!quoted && (ch === '\n' || ch === '\r')) {
      if (seenContent) break;
    } else if (!quoted && (ch === ',' || ch === ';' || ch === '\t')) {
      counts[ch] += 1;
      seenContent = true;
    } else if (ch.trim() !== '') {
      seenContent = true;
    }
  }
  let best: CsvDelimiter = ',';
  for (const d of DELIMITERS) if (counts[d] > counts[best]) best = d;
  return best;
}

/** Parses `text` into rows of cells. Blank lines are dropped; a trailing empty line never yields a row. */
export function parseCsv(text: string): ParsedCsv {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const delimiter = sniffDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let touched = false;

  const endCell = (): void => {
    row.push(cell);
    cell = '';
  };
  const endRow = (): void => {
    endCell();
    if (touched && !(row.length === 1 && row[0]?.trim() === '')) rows.push(row);
    row = [];
    touched = false;
  };

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      touched = true;
    } else if (ch === delimiter) {
      endCell();
      touched = true;
    } else if (ch === '\r') {
      if (src[i + 1] === '\n') i += 1;
      endRow();
    } else if (ch === '\n') {
      endRow();
    } else {
      cell += ch;
      touched = true;
    }
  }
  if (touched || cell !== '' || row.length > 0) endRow();
  return { rows, delimiter };
}
