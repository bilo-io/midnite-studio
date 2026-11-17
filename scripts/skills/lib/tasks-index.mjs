// `.midnite/tasks/` readers/updaters (Phase 151 Theme A). Pure string functions plus thin fs wrappers.
// The category `_INDEX.md` phase table is `| Phase | Status | Refined | Done | Progress | % | 🔄 WIP | ◻ TODO |`;
// only the row is edited, never any prose (see CLAUDE.md).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { bar, parseMdTable, pct } from './format.mjs';

export const CATEGORIES = ['FEATURES', 'SECURITY', 'ISSUES'];
const EXCLUDED = /⏳\s*\*{0,2}\s*deferred|❌\s*\*{0,2}\s*OUT OF SCOPE/i;

/** Count `- [x]` / `- [ ]` items in a phase doc. Items marked deferred / out of scope are excluded. */
export function countCheckboxes(text) {
  let done = 0;
  let open = 0;
  let excluded = 0;
  for (const m of text.matchAll(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/gm)) {
    if (EXCLUDED.test(m[2].slice(0, 60))) excluded++;
    else if (m[1] === ' ') open++;
    else done++;
  }
  const total = done + open;
  return { done, open, excluded, total, pct: pct(done, total), bar: bar(pct(done, total)) };
}

/** Per-theme counts: checkbox items grouped under `### Theme X` / `### X —` headings. */
export function countByTheme(text) {
  const out = {};
  let theme = null;
  for (const line of text.split('\n')) {
    const h = /^###\s+(?:Theme\s+)?([A-Z])\b/.exec(line);
    if (h) theme = h[1];
    else if (/^##\s/.test(line)) theme = null;
    const c = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/.exec(line);
    if (c && theme && !EXCLUDED.test(c[2].slice(0, 60))) {
      out[theme] ??= { done: 0, open: 0 };
      out[theme][c[1] === ' ' ? 'open' : 'done']++;
    }
  }
  return out;
}

const link = /^\[(\d+)\b[^\]]*\]\(([^)]*)\)/;

/** Parse the `## Phases` table of a category `_INDEX.md` into row objects (keeps the raw cells). */
export function parseIndex(text) {
  const { headers, rows } = parseMdTable(text);
  return rows.map((cells) => {
    const m = link.exec(cells[0] ?? '');
    return {
      phase: m ? Number(m[1]) : null,
      path: m ? m[2] : null,
      title: (cells[0] ?? '').replace(/^\[|\]\([^)]*\)$/g, ''),
      status: cells[1],
      refined: cells[2],
      done: cells[3],
      progress: cells[4],
      pct: cells[5],
      wip: cells[6],
      todo: cells[7],
      cells,
      headers,
    };
  });
}

export const readIndex = (root, category) => parseIndex(readFileSync(join(root, '.midnite/tasks', category, '_INDEX.md'), 'utf8'));

/** Rewrite the Done / Progress / % cells of one phase's row in `_INDEX.md` text from checkbox counts. */
export function updateIndexRow(text, phase, { done, total }) {
  const p = pct(done, total);
  const cellsNew = { done: `${done}/${total}`, progress: `\`${bar(p)}\``, pct: `${p}%` };
  return text
    .split('\n')
    .map((line) => {
      const m = /^\|\s*\[(\d+)\b/.exec(line);
      if (!m || Number(m[1]) !== Number(phase)) return line;
      const cells = line.replace(/^\||\|\s*$/g, '').split(/(?<!\\)\|/);
      cells[3] = ` ${cellsNew.done} `;
      cells[4] = ` ${cellsNew.progress} `;
      cells[5] = ` ${cellsNew.pct} `;
      return `|${cells.join('|')}|`;
    })
    .join('\n');
}

export const writeIndexRow = (root, category, phase, counts) => {
  const file = join(root, '.midnite/tasks', category, '_INDEX.md');
  writeFileSync(file, updateIndexRow(readFileSync(file, 'utf8'), phase, counts));
};
