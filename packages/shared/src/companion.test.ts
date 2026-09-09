import { describe, expect, it } from 'vitest';

import type { Ref } from './domain';
import {
  COMPANION_DEFAULT_DIGEST_WINDOW_MS,
  COMPANION_EVENTS,
  COMPANION_LOCAL_VOICES,
  COMPANION_LOCAL_VOICE_DEFAULT,
  COMPANION_LOCAL_VOICE_IDS,
  COMPANION_PHRASES,
  COMPANION_PHRASE_KINDS,
  COMPANION_STATES,
  CompanionDigestSchema,
  COMPANION_REPEAT_TOKENS,
  COMPANION_STOP_TOKENS,
  COMPANION_TRUNCATION_TAIL,
  CompanionHonorificsSchema,
  CompanionIntentSchema,
  CompanionNamesSchema,
  CompanionSnapshotSchema,
  composeOverviewMarkdown,
  describeSnapshot,
  emptyCompanionSnapshot,
  escapeMarkdownInline,
  extractLastAgentTurn,
  interpolatePhrase,
  isCompanionLocalVoiceId,
  markdownToSpeech,
  matchesCompanionName,
  noRepeatWindow,
  parseAskReply,
  parseDoneEntries,
  parseIndexWipRows,
  parseIntent,
  pickHonorific,
  pickPhrase,
  plural,
  resolveDefaultBranch,
  sanitizeForSpeech,
  splitForSpeech,
  summariseDigest,
  transition,
  type CompanionDigest,
  type CompanionCommandId,
  type CompanionDigestItem,
  type CompanionSnapshot,
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

describe('pickHonorific (Ad Hoc: "What it calls you" as a list)', () => {
  it('resolves an empty list to the empty string, same as no honorific ever did', () => {
    expect(pickHonorific([])).toBe('');
  });

  it('is the only choice when there is exactly one', () => {
    expect(pickHonorific(['sir'], () => 0)).toBe('sir');
    expect(pickHonorific(['sir'], () => 0.99)).toBe('sir');
  });

  it('is deterministic under an injected rng', () => {
    const honorifics = ['sir', 'Ada', 'boss'];
    expect(pickHonorific(honorifics, () => 0)).toBe('sir');
    expect(pickHonorific(honorifics, () => 0.99)).toBe('boss');
  });

  it('clamps a degenerate rng that returns 1', () => {
    expect(pickHonorific(['sir', 'Ada'], () => 1)).toBe('Ada');
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
    // Not the literal old "still in flight" — Theme B varies this line across
    // 4 templates, only one of which starts with "Still"; "in flight" is the
    // one substring every template shares.
    expect(lines[1]).toContain('in flight');
  });

  it('parses back through its own schema', () => {
    expect(() =>
      CompanionDigestSchema.parse(digest({ landed: [item('phase', '79')] })),
    ).not.toThrow();
  });

  describe('Theme B — category buckets, rng and grammar', () => {
    const commit = (subject: string): CompanionDigestItem => item('commit', subject);

    it('reproduces the brief\'s own example: 4 dependency updates, 3 fixes', () => {
      const landed = [
        ...Array.from({ length: 4 }, (_, i) => commit(`chore(deps): bump pkg-${i} to 2.0.0`)),
        ...Array.from({ length: 3 }, (_, i) => commit(`fix(auth): correct thing ${i}`)),
      ];
      // 7 items is past COMPANION_DIGEST_NAME_CAP (5), which is exactly the
      // regime the brief's example lives in: counts plus one or two
      // representative specifics, not all seven titles.
      const lines = summariseDigest(digest({ landed }), now, () => 0);
      expect(lines[0]).toContain('4 dependency updates');
      expect(lines[0]).toContain('3 fixes');
      expect(lines[0]).toContain('updating bump pkg-0 to 2.0.0');
    });

    it('omits the scope clause for a dependency update (its scope named the bucket already)', () => {
      const landed = Array.from({ length: 6 }, (_, i) => commit(`chore(deps): bump pkg-${i}`));
      const lines = summariseDigest(digest({ landed }), now, () => 0);
      expect(lines[0]).toContain('updating bump pkg-0');
      expect(lines[0]).not.toContain(' in deps');
    });

    it('names the scope for a non-dependency category', () => {
      const landed = Array.from({ length: 6 }, (_, i) => commit(`fix(auth): correct thing ${i}`));
      const lines = summariseDigest(digest({ landed }), now, () => 0);
      expect(lines[0]).toContain('updating correct thing 0 in auth');
    });

    it('falls back to countByKind when nothing categorises (unchanged behaviour)', () => {
      const landed = Array.from({ length: 6 }, (_, i) => commit(`untyped subject ${i}`));
      const lines = summariseDigest(digest({ landed }), now, () => 0);
      expect(lines[0]).toContain('6 commits');
      expect(lines[0]).not.toContain('untyped subject 0');
    });

    it('two different seeded rng sequences produce different, both-grammatical sentences', () => {
      const landed = [
        ...Array.from({ length: 4 }, (_, i) => commit(`chore(deps): bump pkg-${i}`)),
        ...Array.from({ length: 3 }, (_, i) => commit(`fix(auth): correct thing ${i}`)),
      ];
      const seq = (values: number[]): (() => number) => {
        const queue = [...values];
        return () => queue.shift() ?? 0;
      };
      const a = summariseDigest(digest({ landed }), now, seq([0, 0]));
      const b = summariseDigest(digest({ landed }), now, seq([0.99, 0.99]));
      expect(a[0]).not.toBe(b[0]);
      for (const line of [a[0] as string, b[0] as string]) {
        expect(line).not.toContain('  ');
        expect(line.trim()).toBe(line);
        expect(line).toContain('4 dependency updates');
        expect(line).toContain('3 fixes');
      }
    });

    it('is byte-exact for a fixed rng sequence (deterministic-test requirement)', () => {
      const landed = Array.from({ length: 6 }, (_, i) => commit(`fix(app): correct thing ${i}`));
      // 30 days out resolves to "in the last 4 weeks" — a day-count label,
      // unlike the weekday form, so this stays byte-exact under any timezone.
      const since = now - 30 * 24 * 3600_000;
      const lines = summariseDigest(digest({ landed, since }), now, () => 0);
      expect(lines[0]).toBe(
        'In the last 4 weeks, 6 fixes landed — including updating correct thing 0 in app.',
      );
    });
  });
});

describe('plural', () => {
  it('never doubles a naive "s" into the "1 fixes" failure mode', () => {
    expect(plural(1, 'fix')).toBe('1 fix');
    expect(plural(1, 'commit')).toBe('1 commit');
  });

  it('spells the irregular plurals this module actually uses', () => {
    expect(plural(0, 'fix')).toBe('0 fixes');
    expect(plural(2, 'fix')).toBe('2 fixes');
    expect(plural(5, 'fix')).toBe('5 fixes');
    expect(plural(3, 'tracker entry')).toBe('3 tracker entries');
  });

  it('keeps the regular "s" plural for everything else', () => {
    expect(plural(0, 'commit')).toBe('0 commits');
    expect(plural(2, 'commit')).toBe('2 commits');
    expect(plural(5, 'dependency update')).toBe('5 dependency updates');
  });
});

describe('summariseDigest template grammar (Theme B)', () => {
  // Every template rendered at every connective, at counts 0, 1, 2 and 5+ —
  // a vitest sweep rather than eyeballed fixtures, per the phase brief (this
  // repo's eslint has no precedent for asserting string content).
  const EXPECTED_PLURALS: Record<string, string> = {
    'dependency update': 'dependency updates',
    fix: 'fixes',
    feature: 'features',
    commit: 'commits',
    'pull request': 'pull requests',
    'tracker entry': 'tracker entries',
  };
  const COUNTS = [0, 1, 2, 5];
  const CONNECTIVES = ['including', 'among them', 'notably'];

  // Re-derive the module's private template banks by rendering summariseDigest
  // itself across every rng index rather than reaching for private state —
  // `pickIndex`'s clamp means index i comes from rng() just under i/length.
  function renderAllTemplates(kind: 'landed' | 'inProgress', now: number): string[] {
    const digestFor = (over: Partial<CompanionDigest>): CompanionDigest => ({
      landed: [],
      inProgress: [],
      since: now - 3 * 24 * 60 * 60 * 1000,
      ...over,
    });
    const item = (title: string): CompanionDigestItem => ({
      kind: 'commit',
      title,
      ref: 'x',
      at: now - 1000,
    });
    const items = [item('fix(app): a'), item('fix(app): b'), item('fix(app): c')];
    const templateCount = 4;
    const lines: string[] = [];
    for (let t = 0; t < templateCount; t += 1) {
      for (let c = 0; c < CONNECTIVES.length; c += 1) {
        const rng = ((): (() => number) => {
          const queue = [
            (t + 0.1) / templateCount,
            (c + 0.1) / CONNECTIVES.length,
            (t + 0.1) / templateCount,
            (c + 0.1) / CONNECTIVES.length,
          ];
          return () => queue.shift() ?? 0;
        })();
        const digestValue =
          kind === 'landed' ? digestFor({ landed: items }) : digestFor({ inProgress: items });
        const lines_ = summariseDigest(digestValue, now, rng);
        lines.push(kind === 'landed' ? (lines_[0] as string) : (lines_[1] as string));
      }
    }
    return lines;
  }

  it('every landed/in-progress template renders with no double space and no dangling connective', () => {
    const now = Date.parse('2026-09-08T12:00:00Z');
    for (const line of [...renderAllTemplates('landed', now), ...renderAllTemplates('inProgress', now)]) {
      expect(line).not.toContain('  ');
      expect(line.trim()).toBe(line);
      // A connective word never appears with nothing after it (no trailing
      // "including." / "notably."), and never doubled ("including including").
      for (const connective of CONNECTIVES) {
        expect(line).not.toMatch(new RegExp(`${connective}\\.$`));
        expect(line).not.toContain(`${connective} ${connective}`);
      }
    }
  });

  it('pluralises every category/kind word correctly at counts 0, 1, 2 and 5+', () => {
    for (const [word, expectedPlural] of Object.entries(EXPECTED_PLURALS)) {
      for (const count of COUNTS) {
        const rendered = plural(count, word);
        // The classic failure this test exists to catch: "1 fixes" (an "s"
        // stuck on the singular) at count === 1, and "N fixs" (a naive "s" on
        // an irregular plural) at every other count.
        const expected = count === 1 ? `1 ${word}` : `${count} ${expectedPlural}`;
        expect(rendered).toBe(expected);
      }
    }
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

// --- D · describeSnapshot ---------------------------------------------------

function snapshotFixture(over: Partial<CompanionSnapshot> = {}): CompanionSnapshot {
  return {
    ...emptyCompanionSnapshot(1),
    repo: {
      id: 'r1',
      path: '/Users/x/midnite-studio',
      name: 'midnite-studio',
      headRef: 'main',
      worktrees: [],
    },
    branch: 'main',
    openPulls: 0,
    failingChecks: 0,
    ...over,
  };
}

describe('describeSnapshot', () => {
  it('names the repo and the branch first', () => {
    expect(describeSnapshot(snapshotFixture())[0]).toBe('You are in midnite-studio, on main.');
  });

  it('says nothing about a zero — a clean repo is two sentences, not six', () => {
    const lines = describeSnapshot(snapshotFixture());
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('Everything is clean and nothing is running.');
  });

  it('reports ahead and behind together when both are non-zero', () => {
    expect(describeSnapshot(snapshotFixture({ ahead: 3, behind: 1 }))).toContain(
      'That branch is 3 commits ahead and 1 commit behind.',
    );
  });

  it('reports only the side that is non-zero', () => {
    expect(describeSnapshot(snapshotFixture({ ahead: 1 }))).toContain(
      'It is 1 commit ahead of the remote.',
    );
    expect(describeSnapshot(snapshotFixture({ behind: 2 }))).toContain(
      'It is 2 commits behind the remote.',
    );
  });

  it('breaks the dirty count down by part, dropping the empty parts', () => {
    expect(
      describeSnapshot(snapshotFixture({ dirty: { staged: 2, unstaged: 0, untracked: 5 } })),
    ).toContain('7 changes: 2 staged, 5 untracked.');
  });

  it('names how many sessions are thinking and waiting', () => {
    expect(
      describeSnapshot(snapshotFixture({ sessions: { live: 3, thinking: 1, waiting: 2 } })),
    ).toContain('3 sessions running — 1 thinking, 2 waiting on you.');
  });

  it('admits an unreachable forge in one sentence rather than dropping the fields', () => {
    expect(describeSnapshot(snapshotFixture({ openPulls: null, failingChecks: null }))).toContain(
      'I could not reach GitHub, so I have nothing on pull requests or checks.',
    );
  });

  it('reports open pulls and failing checks when there are any', () => {
    expect(describeSnapshot(snapshotFixture({ openPulls: 4, failingChecks: 1 }))).toContain(
      '4 open pull requests and 1 check failing.',
    );
  });

  it('answers the no-repo case with the count it can offer', () => {
    expect(describeSnapshot(emptyCompanionSnapshot(3))).toEqual([
      'No repository is open — you have 3 ones to choose from.',
    ]);
    expect(describeSnapshot(emptyCompanionSnapshot(0))).toEqual(['No repository is open yet.']);
  });

  it('says "detached head" rather than a branch name when there is none', () => {
    expect(describeSnapshot(snapshotFixture({ branch: null }))[0]).toBe(
      'You are in midnite-studio, on a detached head.',
    );
  });
});

// --- E · parseIntent -------------------------------------------------------

describe('parseIntent — one row per verb', () => {
  const rows: ReadonlyArray<[string, CompanionCommandId]> = [
    ['start an ad hoc task', 'execAdhoc'],
    ['run an adhoc task', 'execAdhoc'],
    ['kick off an ad-hoc task', 'execAdhoc'],
    ['do a one off', 'execAdhoc'],
    ['start a swarm', 'execSwarm'],
    ['launch the exec swarm', 'execSwarm'],
    ['run the next task', 'execBacklog'],
    ['do the backlog', 'execBacklog'],
    ['start the next phase', 'execBacklog'],
    ["let's brainstorm", 'brainstorm'],
    ['please brain storm something', 'brainstorm'],
    ['refine phase 79', 'refine'],
    ['address an issue', 'addressIssue'],
    ['fix an issue', 'addressIssue'],
    ['triage the issues', 'addressIssue'],
    ['review the pr', 'prReview'],
    ['pr review please', 'prReview'],
    ['code review this', 'prReview'],
    ['pr feedback', 'prFeedback'],
    ['address feedback', 'prFeedback'],
    ['git report', 'gitReport'],
    ['what did i do this week', 'gitReport'],
    ['git cleanup', 'gitCleanup'],
    ['clean up branches', 'gitCleanup'],
  ];

  it.each(rows)('reads %j as %s', (text, id) => {
    const intent = parseIntent(text);
    expect(intent.kind).toBe('command');
    expect(intent.kind === 'command' && intent.id).toBe(id);
  });

  it('carries the remainder as the body, dropping the leading connective', () => {
    expect(parseIntent('start an ad hoc task to fix the flaky spec')).toEqual({
      kind: 'command',
      id: 'execAdhoc',
      body: 'fix the flaky spec',
    });
  });

  it('omits an empty body rather than sending an empty string', () => {
    expect(parseIntent('start an ad hoc task')).toEqual({ kind: 'command', id: 'execAdhoc' });
  });

  it('flags "anyway" as an override and keeps it out of the body', () => {
    expect(parseIntent('start a swarm anyway')).toEqual({
      kind: 'command',
      id: 'execSwarm',
      override: true,
    });
    expect(parseIntent('run an ad hoc task on the parser anyway')).toEqual({
      kind: 'command',
      id: 'execAdhoc',
      body: 'the parser',
      override: true,
    });
  });

  it('prefers the more specific command when two tables could match', () => {
    // "next ad hoc task" contains `next task`'s words but not the phrase, and
    // `execAdhoc` is tried first regardless.
    expect(parseIntent('run the next ad hoc task').kind === 'command').toBe(true);
    const intent = parseIntent('run the next ad hoc task');
    expect(intent.kind === 'command' && intent.id).toBe('execAdhoc');
  });
});

describe('parseIntent — the negatives', () => {
  it.each([
    'a swarm of bees settled on the porch',
    'the backlog is a diary, not a plan',
    'i refined my technique over the years',
    'this codebase is a swarm',
    'what does refine mean',
  ])('leaves %j as freeform', (text) => {
    expect(parseIntent(text)).toEqual({ kind: 'freeform', text });
  });

  it('requires an imperative, or the imperative position, before a bare one-word verb', () => {
    expect(parseIntent('a swarm of bees').kind).toBe('freeform');
    expect(parseIntent('start a swarm').kind).toBe('command');
    // First word — imperative mood by position, no verb needed.
    expect(parseIntent('swarm').kind).toBe('command');
    expect(parseIntent('refine phase 79')).toEqual({
      kind: 'command',
      id: 'refine',
      body: 'phase 79',
    });
  });

  it('lets a multi-word phrase stand on its own', () => {
    expect(parseIntent('pr feedback').kind).toBe('command');
  });
});

describe('parseIntent — the control words', () => {
  it.each(COMPANION_STOP_TOKENS)('reads %j as stop', (token) => {
    expect(parseIntent(token)).toEqual({ kind: 'stop' });
  });

  it.each(COMPANION_REPEAT_TOKENS)('reads %j as repeat', (token) => {
    expect(parseIntent(token)).toEqual({ kind: 'repeat' });
  });

  it('reads a bare "anyway" as the override on its own', () => {
    expect(parseIntent('anyway')).toEqual({ kind: 'anyway' });
    expect(parseIntent('go ahead')).toEqual({ kind: 'anyway' });
  });

  it('only honours a control word as the whole utterance', () => {
    // "stop the swarm" is a command about a swarm, not a request for silence.
    expect(parseIntent('stop the swarm').kind).not.toBe('stop');
  });

  it.each(['no', 'no thanks', 'stay here', 'this one', 'never mind'])(
    'reads %j as a dismissal',
    (token) => {
      expect(parseIntent(token)).toEqual({ kind: 'dismiss' });
    },
  );

  it('reads music on and off, and prefers music over dismissal', () => {
    expect(parseIntent('put some music on')).toEqual({ kind: 'music', on: true });
    expect(parseIntent('yes please, music')).toEqual({ kind: 'music', on: true });
    expect(parseIntent('no music')).toEqual({ kind: 'music', on: false });
    expect(parseIntent('stop the music')).toEqual({ kind: 'music', on: false });
  });

  it('tolerates trailing punctuation and any casing', () => {
    expect(parseIntent('  STOP! ')).toEqual({ kind: 'stop' });
    expect(parseIntent('Start A Swarm.').kind).toBe('command');
  });

  it('reads an empty line as freeform rather than throwing', () => {
    expect(parseIntent('   ')).toEqual({ kind: 'freeform', text: '' });
  });
});

describe('parseIntent — switching repositories', () => {
  it('reads a named switch', () => {
    expect(parseIntent('switch to bilo-mono')).toEqual({
      kind: 'switchRepo',
      name: 'bilo-mono',
    });
    expect(parseIntent('go over to the ekko repo')).toEqual({
      kind: 'switchRepo',
      name: 'ekko',
    });
  });

  it('reads an unnamed switch as a request for the list', () => {
    expect(parseIntent('switch')).toEqual({ kind: 'switchRepo' });
    expect(parseIntent('another repo')).toEqual({ kind: 'switchRepo' });
  });
});

describe('CompanionIntentSchema', () => {
  it('round-trips every arm parseIntent can produce', () => {
    for (const text of ['start a swarm', 'switch to x', 'no', 'music on', 'repeat', 'stop', 'anyway', 'hello there']) {
      expect(CompanionIntentSchema.safeParse(parseIntent(text)).success).toBe(true);
    }
  });

  it('refuses a command id that is not in the allowed set', () => {
    expect(
      CompanionIntentSchema.safeParse({ kind: 'command', id: 'releaseComplete' }).success,
    ).toBe(false);
  });
});

describe('matchesCompanionName', () => {
  it('matches case-insensitively', () => {
    expect(matchesCompanionName('hey Companion, what happened', ['Companion'])).toBe(true);
    expect(matchesCompanionName('hey COMPANION', ['companion'])).toBe(true);
  });

  it('matches a trimmed name against untrimmed text', () => {
    expect(matchesCompanionName('  companion  ', ['Companion'])).toBe(true);
  });

  it('matches any of several aliases', () => {
    const names = ['Companion', 'Jarvis', 'Kit'];
    expect(matchesCompanionName('Jarvis, run the tests', names)).toBe(true);
    expect(matchesCompanionName('kit are you there', names)).toBe(true);
    expect(matchesCompanionName('nothing relevant here', names)).toBe(false);
  });

  it('never matches as a substring — "Moses" is not "Mo"', () => {
    expect(matchesCompanionName('Moses parted the sea', ['Mo'])).toBe(false);
    expect(matchesCompanionName('Mo, run the tests', ['Mo'])).toBe(true);
  });

  it('returns false for empty text or an empty names list', () => {
    expect(matchesCompanionName('', ['Companion'])).toBe(false);
    expect(matchesCompanionName('companion', [])).toBe(false);
  });
});

describe('CompanionNamesSchema', () => {
  it('accepts a non-empty array of non-blank names', () => {
    expect(CompanionNamesSchema.safeParse(['Companion']).success).toBe(true);
    expect(CompanionNamesSchema.safeParse(['Companion', 'Jarvis']).success).toBe(true);
  });

  it('trims each name', () => {
    const result = CompanionNamesSchema.safeParse(['  Companion  ']);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(['Companion']);
  });

  it('rejects an empty array', () => {
    expect(CompanionNamesSchema.safeParse([]).success).toBe(false);
  });

  it('rejects a blank name', () => {
    expect(CompanionNamesSchema.safeParse(['   ']).success).toBe(false);
  });
});

describe('CompanionHonorificsSchema (Ad Hoc: "What it calls you" as a list)', () => {
  it('accepts an empty array — the existing default, now representable as zero honorifics', () => {
    expect(CompanionHonorificsSchema.safeParse([]).success).toBe(true);
  });

  it('accepts a non-empty array of non-blank honorifics', () => {
    expect(CompanionHonorificsSchema.safeParse(['sir']).success).toBe(true);
    expect(CompanionHonorificsSchema.safeParse(['sir', 'Ada']).success).toBe(true);
  });

  it('trims each honorific', () => {
    const result = CompanionHonorificsSchema.safeParse(['  sir  ']);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(['sir']);
  });

  it('rejects a blank honorific', () => {
    expect(CompanionHonorificsSchema.safeParse(['   ']).success).toBe(false);
  });
});

describe('the local voice catalog', () => {
  it('lists af_heart as the default, and the default is a real catalog entry', () => {
    expect(COMPANION_LOCAL_VOICE_DEFAULT).toBe('af_heart');
    expect(COMPANION_LOCAL_VOICE_IDS).toContain(COMPANION_LOCAL_VOICE_DEFAULT);
  });

  it('gives every id in the catalog a matching info entry, and no more', () => {
    expect(COMPANION_LOCAL_VOICES.map((voice) => voice.id).sort()).toEqual(
      [...COMPANION_LOCAL_VOICE_IDS].sort(),
    );
  });

  it('has unique ids', () => {
    const ids = COMPANION_LOCAL_VOICES.map((voice) => voice.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is all English — Kokoro-82M ships no other language', () => {
    for (const voice of COMPANION_LOCAL_VOICES) {
      expect(['en-us', 'en-gb']).toContain(voice.language);
    }
  });
});

describe('isCompanionLocalVoiceId', () => {
  it('accepts every id the catalog lists', () => {
    for (const id of COMPANION_LOCAL_VOICE_IDS) expect(isCompanionLocalVoiceId(id)).toBe(true);
  });

  it('rejects null and an unrecognised string alike', () => {
    expect(isCompanionLocalVoiceId(null)).toBe(false);
    expect(isCompanionLocalVoiceId('not-a-real-voice')).toBe(false);
  });
});

// --- E · extractLastAgentTurn ---------------------------------------------

/**
 * A captured Claude Code frame, escape by escape — the alternate-screen
 * switch, an OSC window title terminated by BEL, a hidden cursor, colour,
 * cursor moves, an erase-to-end-of-line, a spinner redrawn in place with
 * carriage returns, and the mode footer that `frameEnd` matches.
 */
const CLAUDE_FRAME = [
  '\x1b[?1049h\x1b[?25l',
  '\x1b]0;claude — midnite-studio\x07',
  '\x1b[1;36m> \x1b[0mrun the tests',
  '\x1b[2K\x1b[1A',
  '✳ Thinking… \x1b[90m(3s)\x1b[0m\r✶ Thinking… \x1b[90m(4s)\x1b[0m',
  '\x1b(B\x1b[m',
  'All 412 tests passed.',
  '\x1b[?25h? for shortcuts',
].join('\n');

describe('extractLastAgentTurn', () => {
  const markers = {
    awaitingInput: '\\u276F\\s{1,3}\\d{1,2}[.)]\\s|enter to confirm',
    frameEnd: 'shift\\+tab to cycle|auto mode on|\\? for shortcuts',
  };

  it('leaves no escape byte behind', () => {
    const turn = extractLastAgentTurn(CLAUDE_FRAME, markers);
    // eslint-disable-next-line no-control-regex -- asserting the escape byte is GONE is the point of the test.
    expect(turn).not.toMatch(/\x1b/);
    // eslint-disable-next-line no-control-regex -- asserting the escape byte is GONE is the point of the test.
    expect(turn).not.toMatch(/\x1b\[\?25l|\x1b\[1;36m|\x1b\[2K/);
  });

  it('drops the OSC window title, terminator and all', () => {
    const turn = extractLastAgentTurn(CLAUDE_FRAME, markers);
    expect(turn).not.toContain('claude — midnite-studio');
    expect(turn).not.toContain('0;claude');
  });

  it('keeps only the last draft of a line redrawn with carriage returns', () => {
    const turn = extractLastAgentTurn(CLAUDE_FRAME, markers);
    expect(turn).toContain('(4s)');
    expect(turn).not.toContain('(3s)');
  });

  it('keeps the answer', () => {
    expect(extractLastAgentTurn(CLAUDE_FRAME, markers)).toContain('All 412 tests passed.');
  });

  it('cuts the footer the frameEnd marker names', () => {
    expect(extractLastAgentTurn(CLAUDE_FRAME, markers)).not.toContain('? for shortcuts');
  });

  it('takes what lies between the last two boundaries when there are several', () => {
    const two = `first turn\n? for shortcuts\nsecond turn\n? for shortcuts\n`;
    expect(extractLastAgentTurn(two, markers)).toBe('second turn');
  });

  it('falls back to the whole cleaned text for an agent with no markers', () => {
    expect(extractLastAgentTurn('\x1b[32mplain\x1b[0m answer')).toBe('plain answer');
  });

  it('survives a roster regex that does not compile', () => {
    expect(extractLastAgentTurn('answer', { frameEnd: '([' })).toBe('answer');
  });

  it('caps the tail rather than returning a whole scrollback', () => {
    expect(extractLastAgentTurn('x'.repeat(9000), undefined, 100)).toHaveLength(100);
  });

  it('collapses runs of blank lines a TUI leaves behind', () => {
    expect(extractLastAgentTurn('a\n\n\n\n\nb')).toBe('a\n\nb');
  });
});

// --- E · splitForSpeech ---------------------------------------------------

describe('splitForSpeech', () => {
  it('returns one utterance when it already fits', () => {
    expect(splitForSpeech('Short enough.')).toEqual(['Short enough.']);
  });

  it('returns nothing for empty text', () => {
    expect(splitForSpeech('   ')).toEqual([]);
  });

  it('cuts on a sentence boundary and appends the notice', () => {
    const text = 'One sentence. Two sentence. Three sentence.';
    expect(splitForSpeech(text, 25)).toEqual([
      'One sentence.',
      COMPANION_TRUNCATION_TAIL,
    ]);
  });

  it('hard-cuts a single over-long sentence at a word boundary', () => {
    const [spoken] = splitForSpeech('alpha bravo charlie delta echo foxtrot', 20);
    expect(spoken).toBe('alpha bravo charlie');
  });
});

// --- E · parseAskReply ----------------------------------------------------

describe('parseAskReply', () => {
  it('reads a bare JSON object', () => {
    expect(parseAskReply('{"say":"On it."}')).toEqual({ say: 'On it.' });
  });

  it('reads JSON out of a fenced block with prose around it', () => {
    const stdout = 'Here you go:\n```json\n{"say":"Running it.","intent":{"kind":"command","id":"execSwarm"}}\n```\nHope that helps.';
    expect(parseAskReply(stdout)).toEqual({
      say: 'Running it.',
      intent: { kind: 'command', id: 'execSwarm' },
    });
  });

  it('stops at the matching brace, not the last one in the buffer', () => {
    expect(parseAskReply('{"say":"ok"} and then a stray } appeared')).toEqual({ say: 'ok' });
  });

  it('is not fooled by a brace inside a string', () => {
    expect(parseAskReply('{"say":"a } brace"}')).toEqual({ say: 'a } brace' });
  });

  it('returns null for garbage', () => {
    expect(parseAskReply('I am afraid I cannot do that.')).toBeNull();
    expect(parseAskReply('{not json at all')).toBeNull();
    expect(parseAskReply('')).toBeNull();
  });

  it('returns null when the object parses but is the wrong shape', () => {
    expect(parseAskReply('{"answer":"wrong key"}')).toBeNull();
    expect(parseAskReply('{"say":""}')).toBeNull();
  });

  it('rejects an intent the schema does not recognise, object and all', () => {
    expect(parseAskReply('{"say":"ok","intent":{"kind":"rm -rf"}}')).toBeNull();
  });
});

// --- follow-up · one formatted turn -----------------------------------------

describe('escapeMarkdownInline', () => {
  it('neutralises every character a parser would act on, and nothing else', () => {
    expect(escapeMarkdownInline('Phase 79 [M · 4-6h]')).toBe('Phase 79 \\[M · 4-6h\\]');
    expect(escapeMarkdownInline('fix **bold** and snake_case and `code`')).toBe(
      'fix \\*\\*bold\\*\\* and snake\\_case and \\`code\\`',
    );
    expect(escapeMarkdownInline('a plain subject, with punctuation.')).toBe(
      'a plain subject, with punctuation.',
    );
  });
});

describe('composeOverviewMarkdown', () => {
  it('bolds the repo, quotes the branch, and bullets every remaining fact', () => {
    const markdown = composeOverviewMarkdown(
      snapshotFixture({
        ahead: 2,
        behind: 1,
        dirty: { staged: 1, unstaged: 2, untracked: 0 },
        sessions: { live: 1, thinking: 1, waiting: 0 },
        openPulls: 3,
        failingChecks: 1,
      }),
    );

    expect(markdown.split('\n\n')[0]).toBe('**midnite-studio** — on `main`');
    // Every fact after the branch sentence is a bullet, and there is no
    // second copy of the branch line.
    expect(markdown).toContain('- That branch is 2 commits ahead and 1 commit behind.');
    expect(markdown).toContain('- 3 changes: 1 staged, 2 unstaged.');
    expect(markdown).toContain('- 1 session running — 1 thinking.');
    expect(markdown).toContain('- 3 open pull requests and 1 check failing.');
    expect(markdown).not.toContain('You are in midnite-studio');
  });

  it('says a detached head in the heading rather than quoting a branch that is not there', () => {
    expect(composeOverviewMarkdown(snapshotFixture({ branch: null }))).toContain(
      '**midnite-studio** — on a detached head',
    );
  });

  it('renders the no-repo case as one sentence with no heading', () => {
    const markdown = composeOverviewMarkdown(emptyCompanionSnapshot(3));
    expect(markdown).toBe('No repository is open — you have 3 ones to choose from.');
    expect(markdown).not.toContain('**');
  });

  it('hyperlinks the items that carry a url and leaves the rest plain', () => {
    const digest: CompanionDigest = {
      since: Date.parse('2026-09-01T09:00:00Z'),
      landed: [
        {
          kind: 'pr',
          title: 'Phase 79 Themes A, B [M · 4-6h]',
          ref: '#269',
          at: Date.parse('2026-09-02T09:00:00Z'),
          url: 'https://github.com/bilo-io/midnite-studio/pull/269',
        },
        { kind: 'commit', title: 'tidy the broker', ref: 'a1b2c3d4', at: 0 },
      ],
      inProgress: [{ kind: 'phase', title: 'the next phase', ref: '80', at: 0 }],
    };

    const markdown = composeOverviewMarkdown(snapshotFixture(), {
      digest,
      now: Date.parse('2026-09-08T09:00:00Z'),
    });

    expect(markdown).toContain(
      '- [Phase 79 Themes A, B \\[M · 4-6h\\]](https://github.com/bilo-io/midnite-studio/pull/269) (`#269`)',
    );
    expect(markdown).toContain('- tidy the broker (`a1b2c3d4`)');
    expect(markdown).toContain('**In progress**');
    expect(markdown).toContain('- the next phase (`80`)');
  });

  it('drops the ref when the title already names it', () => {
    const digest: CompanionDigest = {
      since: 0,
      landed: [],
      inProgress: [
        { kind: 'commit', title: 'feature/x (3 unpushed)', ref: 'feature/x', at: 0 },
      ],
    };
    const markdown = composeOverviewMarkdown(snapshotFixture(), { digest });
    expect(markdown).toContain('- feature/x (3 unpushed)');
    expect(markdown).not.toContain('(`feature/x`)');
  });

  it('caps the named items at the spoken cap and counts the remainder', () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      kind: 'commit' as const,
      title: `commit ${index}`,
      ref: `sha${index}`,
      at: index,
    }));
    const markdown = composeOverviewMarkdown(snapshotFixture(), {
      digest: { since: 0, landed: many, inProgress: [] },
    });
    expect(markdown).toContain('- commit 4 (`sha4`)');
    expect(markdown).not.toContain('- commit 5 (`sha5`)');
    expect(markdown).toContain('- and 4 more');
  });

  it('says the empty sections rather than omitting them, and closes on a clean slate', () => {
    const markdown = composeOverviewMarkdown(snapshotFixture(), {
      digest: { since: Date.parse('2026-09-07T09:00:00Z'), landed: [], inProgress: [] },
      now: Date.parse('2026-09-08T09:00:00Z'),
    });
    expect(markdown).toContain('**Landed** — nothing yesterday.');
    expect(markdown).toContain('**In progress** — nothing open right now.');
    expect(markdown).toContain('A clean slate, then.');
  });

  it('appends the switch offer only when asked', () => {
    expect(composeOverviewMarkdown(snapshotFixture(), { offerSwitch: true })).toContain(
      'Want to switch to another one?',
    );
    expect(composeOverviewMarkdown(snapshotFixture())).not.toContain('Want to switch');
  });
});

describe('markdownToSpeech', () => {
  it('says a link by its text and never says the url', () => {
    expect(markdownToSpeech('- [Phase 79](https://example.test/pull/1) (`#269`)')).toBe(
      'Phase 79 (#269).',
    );
  });

  it('drops emphasis, backticks, bullets, hashes and quotes', () => {
    expect(markdownToSpeech('## **Landed** since `Tuesday`')).toBe('Landed since Tuesday.');
    expect(markdownToSpeech('> quoted')).toBe('quoted.');
    expect(markdownToSpeech('1. first\n2) second')).toBe('first.\nsecond.');
  });

  it('unescapes what escapeMarkdownInline protected', () => {
    expect(markdownToSpeech(escapeMarkdownInline('Phase 79 [M · 4-6h]'))).toBe(
      'Phase 79 [M · 4-6h].',
    );
  });

  it('adds a terminator only where a line has none, so chunkForSpeech can breathe', () => {
    expect(markdownToSpeech('**midnite-studio** — on `main`')).toBe('midnite-studio — on main.');
    expect(markdownToSpeech('- 3 changes: 1 staged.')).toBe('3 changes: 1 staged.');
    expect(markdownToSpeech('Want to switch to another one?')).toBe(
      'Want to switch to another one?',
    );
  });

  it('drops blank lines rather than turning them into pauses of their own', () => {
    expect(markdownToSpeech('**a**\n\n- b\n\n\n- c')).toBe('a.\nb.\nc.');
  });

  it('speaks a whole composed overview as plain sentences with no markup left', () => {
    const spoken = markdownToSpeech(
      composeOverviewMarkdown(snapshotFixture({ ahead: 1 }), {
        digest: {
          since: Date.parse('2026-09-07T09:00:00Z'),
          landed: [
            {
              kind: 'pr',
              title: 'a **fix**',
              ref: '#1',
              at: 0,
              url: 'https://example.test/pull/1',
            },
          ],
          inProgress: [],
        },
        offerSwitch: true,
        now: Date.parse('2026-09-08T09:00:00Z'),
      }),
    );
    expect(spoken).not.toMatch(/[*`[\]]|https?:/);
    expect(spoken).toContain('midnite-studio — on main.');
    // The escaped `**` in the title is gone rather than spoken.
    expect(spoken).toContain('a fix (#1).');
  });
});

describe('sanitizeForSpeech', () => {
  it('redacts a commit SHA to a fixed placeholder, short or long', () => {
    expect(sanitizeForSpeech('Fix the thing (a1b2c3d).')).toBe('Fix the thing (a commit).');
    expect(sanitizeForSpeech('Reverted 9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e entirely.')).toBe(
      'Reverted a commit entirely.',
    );
  });

  it('does not double-announce a SHA the sentence already named', () => {
    expect(sanitizeForSpeech('Reverted commit a1b2c3d entirely.')).toBe(
      'Reverted commit entirely.',
    );
  });

  it('leaves an ordinary word alone even when every letter happens to be hex-shaped', () => {
    // "effaced" is all a-f letters but has no digit, so it reads as a word, not a SHA.
    expect(sanitizeForSpeech('The old logo was effaced.')).toBe('The old logo was effaced.');
  });

  it('collapses a file path to its basename, or to a fixed placeholder when unhelpful', () => {
    expect(sanitizeForSpeech('See packages/shared/src/companion.ts for the change.')).toBe(
      'See companion.ts for the change.',
    );
    expect(sanitizeForSpeech('See packages/app/src/index.ts for the change.')).toBe(
      'See a file for the change.',
    );
  });

  it('redacts a bare URL to a fixed placeholder, never the url itself', () => {
    expect(sanitizeForSpeech('Details at https://example.test/pull/1.')).toBe(
      'Details at a link.',
    );
  });

  it('redacts a semver token to a fixed placeholder, inline', () => {
    expect(sanitizeForSpeech('Bump the dependency to v1.4.0 today.')).toBe(
      'Bump the dependency to a new version today.',
    );
  });

  it('drops a semver token entirely when it is the whole clause', () => {
    expect(sanitizeForSpeech('v0.3.1.')).toBe('');
  });

  it('leaves a common branch name alone but redacts a punctuation-heavy one', () => {
    expect(sanitizeForSpeech('Merged onto main.')).toBe('Merged onto main.');
    expect(sanitizeForSpeech('Merged onto master.')).toBe('Merged onto master.');
    expect(sanitizeForSpeech('Opened from feature/companion-plan.')).toBe(
      'Opened from a branch.',
    );
    expect(sanitizeForSpeech('Cut from release/v0.3.1.')).toBe('Cut from a branch.');
  });

  it('proves the SHA never reaches the final string, on a real digest row', () => {
    const spoken = sanitizeForSpeech(markdownToSpeech('- Fix the thing (`a1b2c3d`)'));
    expect(spoken).toBe('Fix the thing (a commit).');
    expect(spoken).not.toContain('a1b2c3d');
  });

  it('is idempotent — sanitizing twice equals sanitizing once', () => {
    const cases = [
      'Fix the thing (a1b2c3d).',
      'Reverted commit a1b2c3d entirely.',
      'See packages/shared/src/companion.ts for the change.',
      'See packages/app/src/index.ts for the change.',
      'Details at https://example.test/pull/1.',
      'Bump the dependency to v1.4.0 today.',
      'v0.3.1.',
      'Opened from feature/companion-plan.',
      'Cut from release/v0.3.1.',
      'Merged onto main.',
      'The old logo was effaced.',
      '',
    ];
    for (const input of cases) {
      const once = sanitizeForSpeech(input);
      expect(sanitizeForSpeech(once)).toBe(once);
    }
  });
});
