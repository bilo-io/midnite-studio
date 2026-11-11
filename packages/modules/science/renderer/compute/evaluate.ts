import type { ScienceCell } from '@midnite/studio-shared';

import { compile, math, parse } from './math';

/** One compute cell's answer: the formatted value (and its TeX), or the line that failed. */
export type CellResult = { ok: true; text: string; tex?: string } | { ok: false; line: number; message: string };

/**
 * Runs every compute cell top to bottom against one fresh scope (Phase 126 Theme D.1, Decision 5: no stale
 * state). Each non-blank line is evaluated in turn and the cell's result is the last line's value. A failing
 * line fails its cell only; later cells still run.
 */
export function evaluateNotebook(cells: readonly ScienceCell[]): Record<string, CellResult> {
  const scope = new Map<string, unknown>();
  const results: Record<string, CellResult> = {};
  for (const cell of cells) {
    if (cell.kind !== 'compute') continue;
    results[cell.id] = evaluateCell(cell.source, scope);
  }
  return results;
}

function evaluateCell(source: string, scope: Map<string, unknown>): CellResult {
  let last: { text: string; tex?: string } | null = null;
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (line.trim() === '') continue;
    try {
      const value: unknown = compile(line).evaluate(scope);
      let tex: string | undefined;
      try {
        tex = parse(line).toTex();
      } catch {
        tex = undefined;
      }
      last = { text: math.format(value, { precision: 10 }), ...(tex !== undefined ? { tex } : {}) };
    } catch (e) {
      return { ok: false, line: i + 1, message: e instanceof Error ? e.message : String(e) };
    }
  }
  return last === null ? { ok: true, text: '' } : { ok: true, ...last };
}
