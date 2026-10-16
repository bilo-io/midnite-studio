// @vitest-environment node
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Note } from '@midnite/studio-shared';

import { createNotesStore } from '../notes-store';
import { DAY_MS } from './scheduler';
import { createReviewService, reviewFilePath } from './review-service';

const note = (id: string, body: string): Note => ({
  id,
  repoId: 'r1',
  body,
  status: 'captured',
  done: false,
  createdAt: 1,
  updatedAt: 1,
  order: 0,
});

let dir: string;
let clock: number;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'review-'));
  clock = 1_000_000;
});
afterEach(() => rm(dir, { recursive: true, force: true }));

async function setup(bodies: Record<string, string>) {
  const store = createNotesStore(dir, { debounceMs: 0 });
  for (const [id, body] of Object.entries(bodies)) await store.save(note(id, body));
  await store.flush();
  const service = createReviewService({ directory: dir, store: () => store, now: () => clock });
  return { store, service };
}

describe('review service', () => {
  it('offers every card as new, grades one, and hides it until due', async () => {
    const { service } = await setup({ a: 'Q: one\nA: 1\n\nQ: two\nA: 2' });
    const first = await service.due('r1');
    expect(first.total).toBe(2);
    expect(first.cards.every((c) => c.isNew)).toBe(true);

    const graded = await service.grade('r1', first.cards[0]!.id, 'good');
    expect(graded).toEqual({ ok: true, nextDue: clock + DAY_MS });

    expect((await service.due('r1')).cards).toHaveLength(1);
    clock += DAY_MS;
    const later = await service.due('r1');
    expect(later.cards).toHaveLength(2);
    // The graded card is overdue, so it is not new, and it comes before the new one.
    expect(later.cards.map((c) => c.isNew)).toEqual([false, true]);
  });

  it('rejects a card that does not exist', async () => {
    const { service } = await setup({ a: 'Q: one\nA: 1' });
    expect(await service.grade('r1', 'nope', 'good')).toMatchObject({ ok: false });
  });

  it('never rewrites a note: the notes file is byte-identical after grading', async () => {
    const { service } = await setup({ a: 'Q: one\nA: 1' });
    const file = join(dir, 'notes', 'r1.json');
    const before = await readFile(file, 'utf8');
    const [card] = (await service.due('r1')).cards;
    await service.grade('r1', card!.id, 'easy');
    expect(await readFile(file, 'utf8')).toBe(before);
    expect(JSON.parse(await readFile(reviewFilePath(dir, 'r1'), 'utf8')).version).toBe(1);
  });

  it('starts fresh on a corrupt review file and leaves the notes alone', async () => {
    const { service } = await setup({ a: 'Q: one\nA: 1' });
    await mkdir(join(dir, 'notes-review'), { recursive: true });
    await writeFile(reviewFilePath(dir, 'r1'), '{ not json');
    const file = join(dir, 'notes', 'r1.json');
    const before = await readFile(file, 'utf8');
    const due = await service.due('r1');
    expect(due.cards).toHaveLength(1);
    expect((await service.grade('r1', due.cards[0]!.id, 'good')).ok).toBe(true);
    expect(JSON.parse(await readFile(reviewFilePath(dir, 'r1'), 'utf8')).cards).toBeTypeOf('object');
    expect(await readFile(file, 'utf8')).toBe(before);
  });

  it('keeps review state out of the notes directory scan', async () => {
    const { service, store } = await setup({ a: 'Q: one\nA: 1' });
    const [card] = (await service.due('r1')).cards;
    await service.grade('r1', card!.id, 'good');
    expect((await store.list()).map((n) => n.id)).toEqual(['a']);
  });

  it('drops state for cards whose note is gone', async () => {
    const { service, store } = await setup({ a: 'Q: one\nA: 1', b: 'Q: two\nA: 2' });
    const cards = (await service.due('r1')).cards;
    for (const c of cards) await service.grade('r1', c.id, 'good');
    await store.delete('a', 'r1');
    await store.flush();
    const [left] = (await service.due('r1')).cards.concat();
    clock += 10 * DAY_MS;
    const remaining = (await service.due('r1')).cards[0]!;
    await service.grade('r1', remaining.id, 'good');
    const saved = JSON.parse(await readFile(reviewFilePath(dir, 'r1'), 'utf8'));
    expect(Object.keys(saved.cards)).toEqual([remaining.id]);
    expect(left).toBeUndefined();
  });
});
