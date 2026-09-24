import { describe, expect, it } from 'vitest';

import {
  composeOverviewMarkdown,
  composeOverviewSpeech,
  emptyCompanionSnapshot,
  toSpokenDigest,
  type CompanionDigest,
  type CompanionDigestItem,
  type CompanionSnapshot,
} from './companion';

/**
 * `toSpokenDigest` — the intro/greeting digest's own spoken rendering, a
 * separate file for the reason `companion-voice.test.ts` already is one: the
 * module under test is `companion.ts`, but this slice (Ad Hoc: "the
 * companion's spoken digest") has its own fixtures and reads better on its
 * own than folded into `companion.test.ts`'s 1900+ lines.
 */

function landedItem(over: Partial<CompanionDigestItem> = {}): CompanionDigestItem {
  return { kind: 'commit', title: 'fix: x', ref: 'a', at: 0, ...over };
}

function digestOf(landed: CompanionDigestItem[], inProgress: CompanionDigestItem[]): CompanionDigest {
  return { since: 0, landed, inProgress };
}

/** Picks the first entry of whichever bank `toSpokenDigest`'s opener draws from — deterministic, not tied to its wording. */
const firstOpener = () => 0;

describe('toSpokenDigest — consolidation', () => {
  it('folds several landed items naming the same phase into one phrase', () => {
    const digest = digestOf(
      [
        landedItem({ kind: 'commit', title: 'chore(todo): claim Phase 96 Themes B, A (WIP)' }),
        landedItem({
          kind: 'pr',
          title:
            'feat(shared,desktop,app): Ollama client + IPC + Health page row (Phase 96 Themes B, A) [M · half a day]',
          ref: '#540',
        }),
        landedItem({ kind: 'commit', title: 'chore(todo): claim Phase 96 Theme C (WIP)' }),
      ],
      [],
    );

    const spoken = toSpokenDigest(digest, { rng: firstOpener });
    expect(spoken).toContain('Phase 96, themes A, B and C landed.');
  });

  it('joins theme letters "A, B and C" — oxford-free, not a serial list', () => {
    const digest = digestOf(
      [landedItem({ title: 'Phase 82 Themes A, B, C — waves 4 and 5' })],
      [],
    );
    expect(toSpokenDigest(digest, { rng: firstOpener })).toContain(
      'Phase 82, themes A, B and C landed.',
    );
  });

  it('names one phase group per phase, joined, when several phases landed', () => {
    const digest = digestOf(
      [
        landedItem({ title: 'Phase 82 Theme C: waves 4 and 5' }),
        landedItem({ title: 'Phase 83 Themes A, B — App registry' }),
      ],
      [],
    );
    expect(toSpokenDigest(digest, { rng: firstOpener })).toContain(
      'Phase 82, theme C and Phase 83, themes A and B landed.',
    );
  });

  it('counts, rather than names, landed items with no phase in their title', () => {
    const digest = digestOf(
      [landedItem({ title: 'Ad hoc — the microphone works with no API key' })],
      [],
    );
    const spoken = toSpokenDigest(digest, { rng: firstOpener });
    expect(spoken).toContain('1 change landed.');
    expect(spoken).not.toContain('microphone');
  });

  it('appends a trailing count for items outside every phase group', () => {
    const digest = digestOf(
      [
        landedItem({ title: 'Phase 96 Theme H — a fix' }),
        landedItem({ title: 'Ad hoc — an unrelated cleanup' }),
        landedItem({ title: 'Ad hoc — another unrelated cleanup' }),
      ],
      [],
    );
    expect(toSpokenDigest(digest, { rng: firstOpener })).toContain(
      'Phase 96, theme H landed. Plus 2 other changes.',
    );
  });
});

describe('toSpokenDigest — never speaks WIP, tags, PR numbers, markdown, URLs or emoji', () => {
  it('strips every one of them, because a title is never echoed at all', () => {
    const digest = digestOf(
      [
        landedItem({
          kind: 'pr',
          title:
            'feat(shared): **Ollama** client `sync` (Phase 96 Theme B) [M · half a day] ✅ https://example.com/pr/540',
          ref: '#540',
        }),
        landedItem({ title: 'chore(todo): claim Phase 96 Theme C (WIP) 🔄' }),
      ],
      [],
    );
    const spoken = toSpokenDigest(digest, { rng: firstOpener });
    expect(spoken).not.toMatch(/WIP/);
    expect(spoken).not.toMatch(/#540|#\d+/);
    expect(spoken).not.toMatch(/\[M ·/);
    expect(spoken).not.toMatch(/[*`_[\]]/);
    expect(spoken).not.toMatch(/https?:\/\//);
    expect(spoken).not.toMatch(/[\u{1F300}-\u{1FAFF}✅\u{1F504}]/u);
    expect(spoken).toContain('Phase 96, themes B and C landed.');
  });
});

describe('toSpokenDigest — in-progress is counts only', () => {
  it('never names an in-progress item, only counts it', () => {
    const digest = digestOf(
      [],
      [
        { kind: 'phase', title: 'Phase 96 C, H — Ollama: local and cloud models for agents', ref: '96', at: 0 },
        { kind: 'pr', title: 'feat: an unrelated open PR nobody should hear named', ref: '#1', at: 0 },
      ],
    );
    const spoken = toSpokenDigest(digest, { rng: firstOpener });
    expect(spoken).not.toContain('Ollama');
    expect(spoken).not.toContain('unrelated open PR');
  });

  it('counts distinct phases as "phases" when every in-progress item names one', () => {
    const items: CompanionDigestItem[] = Array.from({ length: 12 }, (_, i) => ({
      kind: 'phase' as const,
      title: `Phase ${90 + i} A — some phase`,
      ref: String(90 + i),
      at: 0,
    }));
    const digest = digestOf([], items);
    expect(toSpokenDigest(digest, { rng: firstOpener })).toContain('12 phases are in progress.');
  });

  it('says "is" for exactly one phase in progress', () => {
    const digest = digestOf([], [{ kind: 'phase', title: 'Phase 90 A — x', ref: '90', at: 0 }]);
    expect(toSpokenDigest(digest, { rng: firstOpener })).toContain('1 phase is in progress.');
  });

  it('falls back to generic "things" when the in-progress set is not all phase-shaped', () => {
    const digest = digestOf(
      [],
      [
        { kind: 'phase', title: 'Phase 90 A — x', ref: '90', at: 0 },
        { kind: 'pr', title: 'fix: something with no phase number', ref: '#2', at: 0 },
      ],
    );
    expect(toSpokenDigest(digest, { rng: firstOpener })).toContain('2 things are in progress.');
  });

  it('dedupes an open PR and its own phase row to one phase in flight', () => {
    const digest = digestOf(
      [],
      [
        { kind: 'phase', title: 'Phase 96 C, H — Ollama', ref: '96', at: 0 },
        { kind: 'pr', title: 'feat(desktop): Phase 96 Theme C follow-up', ref: '#9', at: 0 },
      ],
    );
    expect(toSpokenDigest(digest, { rng: firstOpener })).toContain('1 phase is in progress.');
  });
});

describe('toSpokenDigest — empty cases', () => {
  it('says nothing landed and nothing is in progress when both are empty', () => {
    const spoken = toSpokenDigest(digestOf([], []), { rng: firstOpener });
    expect(spoken).toContain('Nothing has landed, and nothing is in progress right now.');
  });

  it('reports landed with a zero in-progress count', () => {
    const digest = digestOf([landedItem({ title: 'Phase 90 Theme A — x' })], []);
    const spoken = toSpokenDigest(digest, { rng: firstOpener });
    expect(spoken).toContain('Phase 90, theme A landed.');
    expect(spoken).toContain('Nothing is in progress right now.');
  });

  it('reports in-progress with a zero landed count', () => {
    const digest = digestOf([], [{ kind: 'phase', title: 'Phase 90 A — x', ref: '90', at: 0 }]);
    const spoken = toSpokenDigest(digest, { rng: firstOpener });
    expect(spoken).toContain('Nothing landed.');
    expect(spoken).toContain('1 phase is in progress.');
  });
});

describe('toSpokenDigest — the personality touch', () => {
  it('picks one of a small, fixed, deterministic set of openers', () => {
    const digest = digestOf([], []);
    const first = toSpokenDigest(digest, { rng: () => 0 });
    const second = toSpokenDigest(digest, { rng: () => 0.99 });
    // Both are non-empty openers, and a different rng draw can pick a
    // different one — this is the "seeded/rotated, testable" requirement,
    // not an assertion on the exact wording of either bank entry.
    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
  });

  it('respects a configured honorific, exactly as every other phrase bank does', () => {
    const digest = digestOf([], []);
    const spoken = toSpokenDigest(digest, { rng: firstOpener, honorific: 'boss' });
    expect(spoken).toContain('boss');
  });

  it('says nothing extra with no honorific configured', () => {
    const digest = digestOf([], []);
    const spoken = toSpokenDigest(digest, { rng: firstOpener });
    expect(spoken).not.toContain('{name}');
    expect(spoken).not.toMatch(/\s{2,}/);
  });
});

describe('toSpokenDigest — the displayed digest is unaffected', () => {
  function snapshotFixture(over: Partial<CompanionSnapshot> = {}): CompanionSnapshot {
    return {
      ...emptyCompanionSnapshot(1),
      repo: { id: 'r1', path: '/x/midnite-studio', name: 'midnite-studio', headRef: 'main', worktrees: [] },
      branch: 'main',
      ...over,
    };
  }

  it('composeOverviewMarkdown still shows the raw title — WIP, tags, PR ref and all', () => {
    const digest = digestOf(
      [
        landedItem({
          kind: 'pr',
          title: 'feat(shared): Ollama client (Phase 96 Theme B) [M · half a day]',
          ref: '#540',
          url: 'https://github.com/bilo-io/midnite-studio/pull/540',
        }),
      ],
      [],
    );

    const markdown = composeOverviewMarkdown(snapshotFixture(), { digest });
    const speech = composeOverviewSpeech(snapshotFixture(), { digest, rng: firstOpener });

    // The bubble is untouched: same title (only its own `[`/`]` escaped,
    // exactly as `escapeMarkdownInline` always has), same PR link.
    expect(markdown).toContain(
      '[feat(shared): Ollama client (Phase 96 Theme B) \\[M · half a day\\]](https://github.com/bilo-io/midnite-studio/pull/540)',
    );

    // The voice never says any of it.
    expect(speech).not.toContain('540');
    expect(speech).not.toContain('half a day');
    expect(speech).toContain('Phase 96, theme B landed.');
  });

  it('composeOverviewMarkdown is identical whether or not a digest was spoken', () => {
    const digest = digestOf([landedItem({ title: 'Phase 90 Theme A — x' })], []);
    const before = composeOverviewMarkdown(snapshotFixture(), { digest });
    // Speaking the digest is a pure read — calling it twice, or not at all,
    // cannot change what the thread would have shown.
    toSpokenDigest(digest);
    toSpokenDigest(digest);
    const after = composeOverviewMarkdown(snapshotFixture(), { digest });
    expect(after).toBe(before);
  });
});
