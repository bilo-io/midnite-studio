import { describe, expect, it } from 'vitest';

import type { Ref } from './domain';
import {
  COMPANION_DEFAULT_DIGEST_WINDOW_MS,
  COMPANION_EVENTS,
  COMPANION_PHRASES,
  COMPANION_PHRASE_KINDS,
  COMPANION_STATES,
  CompanionDigestSchema,
  CompanionSnapshotSchema,
  emptyCompanionSnapshot,
  interpolatePhrase,
  noRepeatWindow,
  parseDoneEntries,
  parseIndexWipRows,
  pickPhrase,
  resolveDefaultBranch,
  summariseDigest,
  transition,
  type CompanionDigest,
  type CompanionDigestItem,
  type CompanionState,
} from './companion';

describe('transition', () => {
  it('is total — every state × every event yields a state', () => {
    for (const state of COMPANION_STATES) {
      for (const event of COMPANION_EVENTS) {
        const next = transition(state, event);
        expect(COMPANION_STATES).toContain(next);
      }
    }
  });

  it('leaves `off` only on enable', () => {
    for (const event of COMPANION_EVENTS) {
      expect(transition('off', event)).toBe(event === 'enable' ? 'idle' : 'off');
    }
  });

  it('accepts disable from every live state', () => {
    for (const state of COMPANION_STATES.filter((s) => s !== 'off')) {
      expect(transition(state, 'disable')).toBe('off');
    }
  });

  it('greets only from idle', () => {
    expect(transition('idle', 'greet')).toBe('greeting');
    for (const state of COMPANION_STATES.filter((s) => s !== 'idle')) {
      expect(transition(state, 'greet')).toBe(state);
    }
  });

  it('lets listening interrupt speech but not work in flight', () => {
    expect(transition('speaking', 'listen')).toBe('listening');
    expect(transition('greeting', 'listen')).toBe('listening');
    expect(transition('idle', 'listen')).toBe('listening');
    expect(transition('thinking', 'listen')).toBe('thinking');
    expect(transition('handoff', 'listen')).toBe('handoff');
  });

  it('refuses a second submit while a hand-off is live (Decision 10)', () => {
    expect(transition('handoff', 'submit')).toBe('handoff');
    expect(transition('listening', 'submit')).toBe('thinking');
    expect(transition('idle', 'submit')).toBe('thinking');
  });

  it('enters handoff only out of thinking', () => {
    expect(transition('thinking', 'handoff')).toBe('handoff');
    for (const state of COMPANION_STATES.filter((s) => s !== 'thinking' && s !== 'off')) {
      expect(transition(state, 'handoff')).toBe(state);
    }
  });

  it('returns handoff to idle on exit or an idle activity event', () => {
    expect(transition('handoff', 'exit')).toBe('idle');
    expect(transition('handoff', 'activity-idle')).toBe('idle');
    // The same events off a state that never started a pty change nothing.
    expect(transition('thinking', 'exit')).toBe('thinking');
    expect(transition('speaking', 'activity-idle')).toBe('speaking');
  });

  it('lands settle and interrupt on idle from anywhere live', () => {
    for (const state of COMPANION_STATES.filter((s) => s !== 'off')) {
      expect(transition(state, 'settle')).toBe('idle');
      expect(transition(state, 'interrupt')).toBe('idle');
    }
  });

  it('treats a second enable as idempotent, not a reset', () => {
    for (const state of COMPANION_STATES.filter((s) => s !== 'off')) {
      expect(transition(state, 'enable')).toBe(state);
    }
  });

  it('never throws on a repeated illegal event', () => {
    let state: CompanionState = 'idle';
    for (let i = 0; i < 50; i += 1) state = transition(state, 'handoff');
    expect(state).toBe('idle');
  });
});

describe('phrase banks', () => {
  it('has the six kinds the phase names, each non-empty', () => {
    expect(COMPANION_PHRASE_KINDS.sort()).toEqual(
      ['fillers', 'greetings', 'musicOffers', 'prompts', 'quotes', 'signoffs'].sort(),
    );
    for (const kind of COMPANION_PHRASE_KINDS) {
      expect(COMPANION_PHRASES[kind].length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate entry within a bank', () => {
    for (const kind of COMPANION_PHRASE_KINDS) {
      const bank = COMPANION_PHRASES[kind];
      expect(new Set(bank).size).toBe(bank.length);
    }
  });

  it('reads correctly with an empty honorific for every {name} template', () => {
    for (const kind of COMPANION_PHRASE_KINDS) {
      for (const template of COMPANION_PHRASES[kind]) {
        const collapsed = interpolatePhrase(template, '');
        expect(collapsed).not.toContain('{name}');
        expect(collapsed).not.toMatch(/\s,/);
        expect(collapsed).not.toMatch(/,\s*,/);
        expect(collapsed).not.toMatch(/^\s|\s$/);
        expect(collapsed).not.toMatch(/\s{2}/);
      }
    }
  });

  it('keeps every bank free of attributed quotes', () => {
    // The phase's own guardrail: quotes are unattributed by design.
    for (const quote of COMPANION_PHRASES.quotes) {
      expect(quote).not.toMatch(/[—–]\s*[A-Z]/);
    }
  });
});

describe('interpolatePhrase', () => {
  it('substitutes a non-empty honorific verbatim', () => {
    expect(interpolatePhrase('Okay{name}, here we are.', 'sir')).toBe('Okay sir, here we are.');
    expect(interpolatePhrase('Welcome back{name}.', ' Ada ')).toBe('Welcome back Ada.');
  });

  it('collapses a mid-clause placeholder and its space', () => {
    expect(interpolatePhrase('okay {name}, here we are', '')).toBe('okay, here we are');
  });

  it('collapses a trailing placeholder and its comma', () => {
    expect(interpolatePhrase('here we are, {name}', '')).toBe('here we are');
    expect(interpolatePhrase('Welcome back{name}.', '')).toBe('Welcome back.');
  });

  it('collapses a leading placeholder and its comma', () => {
    expect(interpolatePhrase('{name}, welcome back', '')).toBe('welcome back');
  });

  it('collapses several placeholders in one template', () => {
    expect(interpolatePhrase('Right{name}. What next{name}?', '')).toBe('Right. What next?');
  });

  it('leaves a template with no placeholder alone', () => {
    expect(interpolatePhrase('Still going.', '')).toBe('Still going.');
    expect(interpolatePhrase('Still going.', 'sir')).toBe('Still going.');
  });
});

describe('pickPhrase', () => {
  it('never repeats within the no-repeat window', () => {
    const bank = ['a', 'b', 'c', 'd', 'e'] as const;
    const recent: string[] = [];
    // A driven RNG that walks the pool, so the exclusion is what shapes the
    // sequence rather than luck.
    let tick = 0;
    const rng = () => {
      tick += 1;
      return (tick % 7) / 7;
    };

    for (let i = 0; i < 40; i += 1) {
      const pick = pickPhrase(bank, recent, rng);
      expect(recent.slice(0, noRepeatWindow(bank.length))).not.toContain(pick);
      recent.unshift(pick);
    }
  });

  it('sizes the window so a candidate always survives', () => {
    expect(noRepeatWindow(1)).toBe(0);
    expect(noRepeatWindow(2)).toBe(1);
    expect(noRepeatWindow(3)).toBe(2);
    expect(noRepeatWindow(10)).toBe(3);
    expect(noRepeatWindow(0)).toBe(0);
  });

  it('is deterministic under an injected rng', () => {
    const bank = ['a', 'b', 'c', 'd'];
    expect(pickPhrase(bank, [], () => 0)).toBe('a');
    expect(pickPhrase(bank, [], () => 0.99)).toBe('d');
    expect(pickPhrase(bank, ['a'], () => 0)).toBe('b');
  });

  it('repeats forever from a one-entry bank rather than returning nothing', () => {
    expect(pickPhrase(['only'], ['only'], () => 0)).toBe('only');
  });

  it('falls back to the whole bank when the window excludes everything left', () => {
    // Only reachable when a bank holds the same string twice — a build whose
    // words changed under a rehydrated `recentPhrases`. Returning the phrase
    // beats returning nothing.
    expect(pickPhrase(['a', 'a'], ['a'], () => 0)).toBe('a');
  });

  it('answers an empty bank with an empty string', () => {
    expect(pickPhrase([], [], () => 0)).toBe('');
  });

  it('clamps a degenerate rng that returns 1', () => {
    expect(pickPhrase(['a', 'b'], [], () => 1)).toBe('b');
  });
});

describe('CompanionSnapshotSchema', () => {
  it('accepts a snapshot with the forge unreachable', () => {
    const parsed = CompanionSnapshotSchema.parse({
      ...emptyCompanionSnapshot(3),
      branch: 'main',
      openPulls: null,
      failingChecks: null,
    });
    expect(parsed.openPulls).toBeNull();
    expect(parsed.repos).toBe(3);
  });

  it('rejects a negative count', () => {
    expect(() =>
      CompanionSnapshotSchema.parse({ ...emptyCompanionSnapshot(), repos: -1 }),
    ).toThrow();
  });

  it('distinguishes "no checks reachable" from "zero failing"', () => {
    expect(
      CompanionSnapshotSchema.parse({ ...emptyCompanionSnapshot(), failingChecks: 0 })
        .failingChecks,
    ).toBe(0);
  });
});

describe('summariseDigest', () => {
  const now = Date.parse('2026-09-08T12:00:00Z');
  const item = (
    kind: CompanionDigestItem['kind'],
    title: string,
    ref = 'x',
  ): CompanionDigestItem => ({ kind, title, ref, at: now - 1000 });

  const digest = (over: Partial<CompanionDigest>): CompanionDigest => ({
    landed: [],
    inProgress: [],
    since: now - 3 * 24 * 60 * 60 * 1000,
    ...over,
  });

  it('produces between two and five sentences', () => {
    const lines = summariseDigest(
      digest({
        landed: [item('pr', 'browser occlusion')],
        inProgress: [item('pr', 'lane layout')],
      }),
      now,
    );
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.length).toBeLessThanOrEqual(5);
  });

  it('names items up to the cap', () => {
    const lines = summariseDigest(
      digest({
        landed: [
          item('pr', 'browser occlusion'),
          item('pr', 'new-tab chrome'),
          item('commit', 'lane fix'),
        ],
      }),
      now,
    );
    expect(lines[0]).toContain('browser occlusion');
    expect(lines[0]).toContain('new-tab chrome');
    expect(lines[0]).toContain('and lane fix');
    expect(lines[0]).toContain('2 pull requests');
    expect(lines[0]).toContain('1 commit');
  });

  it('collapses past five items to counts', () => {
    const landed = Array.from({ length: 8 }, (_, i) => item('commit', `commit ${i}`));
    const lines = summariseDigest(digest({ landed }), now);
    expect(lines[0]).toContain('8 commits');
    expect(lines[0]).not.toContain('commit 0');
  });

  it('says so when nothing landed and nothing is open', () => {
    const lines = summariseDigest(digest({}), now);
    expect(lines[0]).toContain('Nothing has landed');
    expect(lines[1]).toBe('Nothing is open right now.');
    expect(lines[2]).toBe('A clean slate, then.');
  });

  it('phrases the window as a weekday inside a week', () => {
    const lines = summariseDigest(
      digest({ landed: [item('pr', 'a thing')], since: now - 3 * 24 * 60 * 60 * 1000 }),
      now,
    );
    expect(lines[0]).toMatch(/^Since [A-Z]/);
  });

  it('phrases today, yesterday and a multi-week window differently', () => {
    expect(summariseDigest(digest({ since: now - 3600_000 }), now)[0]).toContain('earlier today');
    expect(summariseDigest(digest({ since: now - 30 * 3600_000 }), now)[0]).toContain('yesterday');
    expect(
      summariseDigest(digest({ since: now - COMPANION_DEFAULT_DIGEST_WINDOW_MS }), now)[0],
    ).toContain('in the last week');
    expect(summariseDigest(digest({ since: now - 30 * 24 * 3600_000 }), now)[0]).toContain(
      'in the last 4 weeks',
    );
  });

  it('survives a nonsense `since` rather than saying "since Invalid Date"', () => {
    for (const since of [0, -1, Number.NaN, now + 10_000]) {
      const lines = summariseDigest(digest({ since }), now);
      expect(lines[0]).toContain('recently');
      expect(lines.join(' ')).not.toContain('Invalid');
    }
  });

  it('collapses an over-cap in-progress list to counts', () => {
    const inProgress = Array.from({ length: 6 }, (_, i) => item('pr', `pr ${i}`));
    const lines = summariseDigest(digest({ inProgress }), now);
    expect(lines[1]).toContain('6 pull requests');
    expect(lines[1]).toContain('still in flight');
  });

  it('parses back through its own schema', () => {
    expect(() =>
      CompanionDigestSchema.parse(digest({ landed: [item('phase', '79')] })),
    ).not.toThrow();
  });
});

describe('resolveDefaultBranch', () => {
  const ref = (name: string, kind: Ref['kind']): Ref => ({
    name,
    fullName: kind === 'remoteBranch' ? `refs/remotes/${name}` : `refs/heads/${name}`,
    kind,
    sha: 'a'.repeat(40),
    upstream: null,
    isHead: false,
    worktreePath: null,
  });

  it('prefers a remote main over a local one', () => {
    expect(
      resolveDefaultBranch([ref('feature/x', 'localBranch'), ref('origin/main', 'remoteBranch')]),
    ).toBe('main');
  });

  it('walks the preference order', () => {
    expect(
      resolveDefaultBranch([
        ref('origin/trunk', 'remoteBranch'),
        ref('origin/master', 'remoteBranch'),
      ]),
    ).toBe('master');
  });

  it('falls back to a local branch when there is no remote', () => {
    expect(
      resolveDefaultBranch([ref('develop', 'localBranch'), ref('feature/y', 'localBranch')]),
    ).toBe('develop');
  });

  it('answers null when nothing recognisable exists', () => {
    expect(resolveDefaultBranch([ref('feature/y', 'localBranch')])).toBeNull();
    expect(resolveDefaultBranch([])).toBeNull();
  });

  it('does not mistake `origin/mainline` for `main`', () => {
    expect(resolveDefaultBranch([ref('origin/mainline', 'remoteBranch')])).toBeNull();
  });
});

describe('parseDoneEntries', () => {
  const fixture = [
    '# Done — append-only log',
    '',
    '## 2026-09-08 — Phase 26 Themes C, H — the reverted items',
    '',
    'Body prose that is not an entry heading.',
    '',
    '## 2026-09-06 - Phase 61 Theme J',
    '',
    '### 2026-01-01 — not a top-level entry',
    '## not-a-date — nope',
    '## 2026-13-45 — impossible date',
  ].join('\n');

  it('reads the date and title of every entry heading', () => {
    const entries = parseDoneEntries(fixture);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      date: '2026-09-08',
      title: 'Phase 26 Themes C, H — the reverted items',
    });
  });

  it('accepts a plain hyphen as well as an em dash', () => {
    expect(parseDoneEntries(fixture)[1]).toMatchObject({ title: 'Phase 61 Theme J' });
  });

  it('ignores `###` sub-headings and non-dates', () => {
    const titles = parseDoneEntries(fixture).map((entry) => entry.title);
    expect(titles.join(' ')).not.toContain('not a top-level entry');
    expect(titles.join(' ')).not.toContain('nope');
  });

  it('drops an impossible date rather than emitting NaN', () => {
    for (const entry of parseDoneEntries(fixture)) expect(Number.isNaN(entry.at)).toBe(false);
  });

  it('returns nothing for an empty file', () => {
    expect(parseDoneEntries('')).toEqual([]);
  });
});

describe('parseIndexWipRows', () => {
  const fixture = [
    '| Phase | Status | Refined | Done | Progress | % | 🔄 WIP | ◻ TODO |',
    '|-------|--------|---------|------|----------|---|--------|--------|',
    '| [79 · The companion that answers back](phases/phase-79-x.md) | 🔄 WIP | — | 0/67 | `░░░░░░░░░░` | 0% | A B | C D |',
    '| [78 · Whose hands](phases/phase-78-x.md) | ◻ TODO | — | 0/32 | `░░░░░░░░░░` | 0% | — | A B |',
    '| [75 · What blocks what](phases/phase-75-x.md) | ✅ DONE | x1 | 99/106 | `█████████░` | 93% | — | — |',
    '| [74 · Media caches](phases/phase-74-x.md) | 🔄 WIP | x1 | 68/70 | `██████████` | 97% | — | E |',
    'not a table row at all',
    '| too | few | cells |',
  ].join('\n');

  it('returns only the WIP rows', () => {
    const rows = parseIndexWipRows(fixture);
    expect(rows.map((row) => row.phase)).toEqual(['79', '74']);
  });

  it('reads the phase number, title and WIP theme letters', () => {
    expect(parseIndexWipRows(fixture)[0]).toEqual({
      phase: '79',
      title: 'The companion that answers back',
      themes: ['A', 'B'],
    });
  });

  it('reads an em-dash WIP cell as no themes', () => {
    expect(parseIndexWipRows(fixture)[1]?.themes).toEqual([]);
  });

  it('skips the header, the separator and anything malformed', () => {
    expect(parseIndexWipRows(fixture)).toHaveLength(2);
    expect(parseIndexWipRows('')).toEqual([]);
  });
});
