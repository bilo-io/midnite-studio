export type RlePattern = { width: number; height: number; cells: [number, number][]; rule?: string };

/**
 * Parses Golly-style RLE: an optional `x = m, y = n, rule = ...` header, then run counts and `b` (dead),
 * `o` (alive), `$` (end of row), `!` (end). Lines starting `#` are comments.
 */
export function parseRle(text: string): RlePattern | { error: string } {
  let width = 0;
  let height = 0;
  let rule: string | undefined;
  let body = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    if (/^x\s*=/i.test(line)) {
      const x = /x\s*=\s*(\d+)/i.exec(line);
      const y = /y\s*=\s*(\d+)/i.exec(line);
      const r = /rule\s*=\s*([^\s,]+)/i.exec(line);
      width = x ? Number(x[1]) : 0;
      height = y ? Number(y[1]) : 0;
      rule = r?.[1];
      continue;
    }
    body += line;
  }
  if (body === '') return { error: 'No pattern data' };
  const cells: [number, number][] = [];
  let x = 0;
  let y = 0;
  let run = '';
  let ended = false;
  for (const ch of body) {
    if (ch >= '0' && ch <= '9') {
      run += ch;
      continue;
    }
    const n = run === '' ? 1 : Number(run);
    run = '';
    if (ch === 'b' || ch === '.') x += n;
    else if (ch === 'o' || ch === 'O') {
      for (let i = 0; i < n; i++) cells.push([x + i, y]);
      x += n;
    } else if (ch === '$') {
      y += n;
      x = 0;
    } else if (ch === '!') {
      ended = true;
      break;
    } else if (!/\s/.test(ch)) return { error: `Unexpected "${ch}" in the pattern` };
  }
  if (!ended) return { error: 'Pattern must end with !' };
  const w = Math.max(width, ...cells.map(([cx]) => cx + 1), 0);
  const h = Math.max(height, ...cells.map(([, cy]) => cy + 1), 0);
  return { width: w, height: h, cells, ...(rule === undefined ? {} : { rule }) };
}

/** `null` when the pattern fits the grid, else the message to show. */
export function fitProblem(p: RlePattern, gridW: number, gridH: number): string | null {
  return p.width > gridW || p.height > gridH ? `Pattern is ${p.width}×${p.height}; the grid is ${gridW}×${gridH}` : null;
}

/** Built-in patterns, each as RLE. */
export const PATTERNS: readonly { name: string; rle: string }[] = [
  { name: 'Glider', rle: 'x = 3, y = 3, rule = B3/S23\nbob$2bo$3o!' },
  { name: 'Lightweight spaceship', rle: 'x = 5, y = 4, rule = B3/S23\nbo2bo$o4b$o3bo$4o!' },
  { name: 'Pulsar', rle: 'x = 13, y = 13, rule = B3/S23\n2b3o3b3o2$o4bobo4bo$o4bobo4bo$o4bobo4bo$2b3o3b3o2$2b3o3b3o$o4bobo4bo$o4bobo4bo$o4bobo4bo2$2b3o3b3o!' },
  { name: 'R-pentomino', rle: 'x = 3, y = 3, rule = B3/S23\nb2o$2ob$bo!' },
  {
    name: 'Gosper glider gun',
    rle: 'x = 36, y = 9, rule = B3/S23\n24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!',
  },
];
