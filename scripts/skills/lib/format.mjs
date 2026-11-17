// Pure rendering helpers shared by the skill scripts (Phase 151 Theme A).

/** Progress bar: `bar(70) -> '███████░░░'`. `cells` defaults to 10; pct is clamped to 0..100. */
export function bar(pct, cells = 10) {
  const p = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  const filled = Math.round((p / 100) * cells);
  return '█'.repeat(filled) + '░'.repeat(cells - filled);
}

/** `pct(done, total)` -> integer percent; 0/0 is 0. */
export const pct = (done, total) => (total > 0 ? Math.floor((done / total) * 100) : 0);

/** Sitrep diff cell: `🟩 +210 🟥 -35 📄 6`, or `—` when everything is zero. */
export function diffCell({ added = 0, deleted = 0, files = 0 } = {}) {
  if (!added && !deleted && !files) return '—';
  return `🟩 +${added} 🟥 -${deleted} 📄 ${files}`;
}

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

/** Markdown table from `headers` and `rows` (arrays of cell values); pipes and newlines are escaped. */
export function mdTable(headers, rows) {
  const line = (cells) => `| ${cells.map(esc).join(' | ')} |`;
  return [line(headers), `|${headers.map(() => '---').join('|')}|`, ...rows.map(line)].join('\n');
}

/** Inverse of mdTable: parse the first pipe table in `text` into `{headers, rows}` (cells trimmed). */
export function parseMdTable(text) {
  const split = (l) =>
    l
      .trim()
      .replace(/^\||\|$/g, '')
      .split(/(?<!\\)\|/)
      .map((c) => c.trim().replace(/\\\|/g, '|'));
  const lines = text.split('\n');
  const start = lines.findIndex((l, i) => /^\s*\|/.test(l) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? ''));
  if (start === -1) return { headers: [], rows: [] };
  const headers = split(lines[start]);
  const rows = [];
  for (let i = start + 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) rows.push(split(lines[i]));
  return { headers, rows };
}

/** Compact duration: 95 -> `1m35s`, 3700 -> `1h01m`. */
export function duration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
}
