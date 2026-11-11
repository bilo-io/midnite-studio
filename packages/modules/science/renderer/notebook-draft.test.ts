import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScienceNotebook } from '@midnite/studio-shared';

import { AUTOSAVE_MS, blankCell, createNotebookDraft, moveCell } from './notebook-draft';

const base: ScienceNotebook = {
  version: 1,
  id: 'nb-aaaaaaaaaaaa',
  title: 'T',
  discipline: 'maths',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  cells: [],
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('notebook draft', () => {
  it('writes once, 600 ms after the last edit', async () => {
    const write = vi.fn().mockResolvedValue({ ok: true, value: { updatedAt: 'x' } });
    const draft = createNotebookDraft({ notebook: base, write });
    draft.setCells((cs) => [...cs, blankCell('markdown')]);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 100);
    draft.setCells((cs) => [...cs, blankCell('compute')]);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 100);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![0].cells).toHaveLength(2);
    expect(draft.getState().dirty).toBe(false);
  });

  it('keeps the draft dirty and reports a failed write', async () => {
    const write = vi.fn().mockResolvedValue({ ok: false, kind: 'error', message: 'disk full' });
    const draft = createNotebookDraft({ notebook: base, write });
    draft.setCells((cs) => [...cs, blankCell('markdown')]);
    await draft.flush();
    expect(draft.getState()).toMatchObject({ dirty: true, error: 'disk full' });
  });

  it('flush writes immediately and a clean draft writes nothing', async () => {
    const write = vi.fn().mockResolvedValue({ ok: true, value: { updatedAt: 'x' } });
    const draft = createNotebookDraft({ notebook: base, write });
    await draft.flush();
    expect(write).not.toHaveBeenCalled();
    draft.setCells((cs) => [...cs, blankCell('markdown')]);
    await draft.flush();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('moves cells within bounds', () => {
    const [a, b] = [blankCell('markdown'), blankCell('compute')];
    expect(moveCell([a, b], 1, -1)).toEqual([b, a]);
    expect(moveCell([a, b], 0, -1)).toEqual([a, b]);
  });

  it('mints valid cell ids', () => {
    expect(blankCell('plot').id).toMatch(/^c-[a-z0-9]{8}$/);
  });
});
