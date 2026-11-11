import { describe, expect, it } from 'vitest';

import { ScienceCellSchema } from '@midnite/studio-shared';

import { evaluateNotebook, runNotebook } from '../compute/evaluate';
import { parseStructure } from '../molecule/parse';
import { SCIENCE_TEMPLATES } from './index';

describe('SCIENCE_TEMPLATES', () => {
  it('has unique ids and every cell parses', () => {
    expect(new Set(SCIENCE_TEMPLATES.map((t) => t.id)).size).toBe(SCIENCE_TEMPLATES.length);
    for (const t of SCIENCE_TEMPLATES) {
      expect(new Set(t.cells.map((c) => c.id)).size).toBe(t.cells.length);
      for (const cell of t.cells) expect(ScienceCellSchema.safeParse(cell).success, `${t.id} ${cell.id}`).toBe(true);
    }
  });

  for (const t of SCIENCE_TEMPLATES) {
    it(`${t.title} evaluates without error`, () => {
      const results = evaluateNotebook(t.cells);
      for (const [id, r] of Object.entries(results)) expect(r, `${t.id} ${id}`).toMatchObject({ ok: true });
    });
  }

  it('plots only sample finite values somewhere', () => {
    for (const t of SCIENCE_TEMPLATES) {
      const { samples } = runNotebook(t.cells);
      for (const [id, s] of Object.entries(samples)) for (const series of s.series) expect(series.ys.some(Number.isFinite), `${t.id} ${id}`).toBe(true);
    }
  });

  it('every molecule cell holds a structure the viewer can read', () => {
    for (const t of SCIENCE_TEMPLATES) {
      for (const c of t.cells) if (c.kind === 'molecule') expect(parseStructure(c.text, c.format), `${t.id} ${c.id}`).toMatchObject({ ok: true });
    }
  });
});
