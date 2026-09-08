import { emptyCompanionSnapshot } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { greet, matchRepoByName, orient, say, sayMarkdown } from './concierge';
import {
  digestFixture,
  fakeConciergeDeps,
  fakeSpeaker,
  fakeStore,
  repoFixture,
  snapshotFixture,
} from './test-doubles';

/**
 * The concierge flow, against fakes — Phase 79 Theme D.
 *
 * What these assert is the *order* and the *silences*: which turns appear,
 * which are skipped because there was nothing to report, and where the machine
 * ends up. All of it deterministic, because none of it involves a model.
 *
 * **The cadence changed in the Phase 79 follow-up and these moved with it.**
 * Theme D posted a turn per fact, so a greeting was six to twelve bubbles and
 * these tests indexed into them. It is now three turns — greeting, one
 * consolidated markdown overview, prompt — so the assertions read the middle
 * turn's markdown rather than counting sentences. What did not change is what
 * is *said*: `composeOverviewMarkdown` is built on the same
 * `describeSnapshot`/digest data, and `shared`'s own tests cover its wording.
 */

describe('greet', () => {
  it('runs greeting → one consolidated overview → prompt, and nothing else', async () => {
    const store = fakeStore();
    const deps = fakeConciergeDeps({ store });
    await greet(deps);

    const lines = store.transcript.map((turn) => turn.text);
    // Three turns, not eight: the spoken greeting, the formatted overview, the
    // open prompt. This is the whole of the follow-up's second fix.
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('Good to see you.');
    expect(lines[2]).toBe('What would you like to do?');

    const overview = lines[1] ?? '';
    expect(overview.startsWith('**midnite-studio** — on `main`')).toBe(true);
    expect(overview).toContain('**Landed**');
    expect(overview).toContain('the browser occlusion fix');
  });

  it('speaks the overview as prose, with no markup read aloud', async () => {
    const store = fakeStore();
    const speaker = fakeSpeaker();
    await greet(fakeConciergeDeps({ store, speaker }));

    const spoken = speaker.spoken.join(' ');
    expect(spoken).toContain('midnite-studio — on main.');
    // Not one asterisk, backtick or bracket reaches the synthesiser.
    expect(spoken).not.toMatch(/[*`[\]]/);
    // And the turn is still marked spoken — the display text differing from
    // the spoken text must not break the `spoken` bookkeeping.
    expect(store.transcript[1]?.spoken).toBe(true);
  });

  it('ends in idle when hands-free is off', async () => {
    const store = fakeStore();
    await greet(fakeConciergeDeps({ store }));
    expect(store.state).toBe('idle');
  });

  it('ends in listening only when hands-free is on AND a provider exists', async () => {
    const armed = fakeStore();
    await greet(
      fakeConciergeDeps({
        store: armed,
        settings: () => ({ honorific: '', handsFree: true, voiceInReady: true }),
      }),
    );
    expect(armed.state).toBe('listening');

    // The switch on with nothing behind it must NOT land in `listening` — the
    // FAB would draw a state the machine could never leave.
    const unarmed = fakeStore();
    await greet(
      fakeConciergeDeps({
        store: unarmed,
        settings: () => ({ honorific: '', handsFree: true, voiceInReady: false }),
      }),
    );
    expect(unarmed.state).toBe('idle');
  });

  it('refuses to run twice over itself', async () => {
    const store = fakeStore('speaking');
    await greet(fakeConciergeDeps({ store }));
    // `transition` refuses `greet` from anywhere but `idle`, and the flow
    // checks the answer rather than assuming it.
    expect(store.transcript).toHaveLength(0);
  });

  it('interpolates the honorific, and collapses it cleanly when empty', async () => {
    const named = fakeStore();
    await greet(
      fakeConciergeDeps({
        store: named,
        settings: () => ({ honorific: 'sir', handsFree: false, voiceInReady: false }),
      }),
    );
    expect(named.transcript[0]?.text).toBe('Good to see you sir.');
  });
});

describe('orient — the switch offer', () => {
  it('offers a switch only when more than one repo is open', async () => {
    const many = fakeStore();
    await orient(
      fakeConciergeDeps({ store: many, snapshot: async () => snapshotFixture({ repos: 3 }) }),
    );
    // Inside the consolidated turn now, not a bubble of its own.
    expect(many.transcript.map((t) => t.text).join('\n')).toContain(
      'Want to switch to another one?',
    );

    const one = fakeStore();
    await orient(fakeConciergeDeps({ store: one }));
    expect(one.transcript.map((t) => t.text).join('\n')).not.toContain('Want to switch');
  });

  it('does not greet — that is what greet() is for', async () => {
    const store = fakeStore();
    await orient(fakeConciergeDeps({ store }));
    expect(store.transcript[0]?.text.startsWith('**midnite-studio** — on `main`')).toBe(true);
  });

  it('skips the digest entirely when no repository is open', async () => {
    const digest = vi.fn();
    const store = fakeStore();
    await orient(
      fakeConciergeDeps({
        store,
        repo: () => ({ path: null, name: null }),
        snapshot: async () => emptyCompanionSnapshot(0),
        digest,
      }),
    );
    expect(digest).not.toHaveBeenCalled();
    expect(store.transcript[0]?.text).toBe('No repository is open yet.');
  });
});

describe('orient — the "last greeted" mark', () => {
  it('reads the digest unmarked, then re-reads the same window marked', async () => {
    const digest = vi.fn().mockResolvedValue(digestFixture());
    await orient(fakeConciergeDeps({ digest }));

    expect(digest).toHaveBeenNthCalledWith(1, { repoPath: '/repos/studio' });
    // The identical window, this time moving the mark — so an interrupted
    // greeting is replayed next launch rather than silently consumed.
    expect(digest).toHaveBeenNthCalledWith(2, {
      repoPath: '/repos/studio',
      since: 1_699_000_000_000,
      mark: true,
    });
  });

  it('does NOT move the mark when the digest was interrupted', async () => {
    const controller = new AbortController();
    const digest = vi.fn().mockImplementation(async () => {
      controller.abort();
      return digestFixture();
    });
    await orient(fakeConciergeDeps({ digest, signal: controller.signal }));
    expect(digest).toHaveBeenCalledTimes(1);
  });
});

describe('the interrupt path', () => {
  it('stops speaking, leaves the cut turn unspoken, and still posts the prompt', async () => {
    const controller = new AbortController();
    const store = fakeStore();
    const speaker = fakeSpeaker();

    await orient(
      fakeConciergeDeps({
        store,
        speaker,
        signal: controller.signal,
        snapshot: async () => {
          controller.abort();
          return snapshotFixture();
        },
      }),
    );

    expect(speaker.spoken).toHaveLength(0);
    expect(store.transcript.every((turn) => turn.spoken === false)).toBe(true);
    // Not silence: a script that stops halfway and says nothing leaves the
    // user staring at a half-finished thread.
    expect(store.transcript.map((t) => t.text)).toContain('What would you like to do?');
  });
});

describe('sayMarkdown', () => {
  it('posts the markdown and speaks its prose rendition', async () => {
    const store = fakeStore();
    const speaker = fakeSpeaker();
    const markdown = '**midnite-studio** — on `main`\n\n- [a fix](https://example.test/pull/1)';

    await sayMarkdown(fakeConciergeDeps({ store, speaker }), markdown);

    expect(store.transcript[0]?.text).toBe(markdown);
    expect(speaker.spoken).toEqual(['midnite-studio — on main.\na fix.']);
  });
});

describe('say', () => {
  it('marks a turn spoken only when a real speaker read it', async () => {
    const store = fakeStore();
    await say(fakeConciergeDeps({ store, speaker: fakeSpeaker() }), 'Hello.');
    expect(store.transcript[0]?.spoken).toBe(true);
  });

  it('leaves the turn unspoken under the silent stand-in, but still posts it', async () => {
    const store = fakeStore();
    // The default configuration of this feature: no voice at all.
    await say(fakeConciergeDeps({ store }), 'Hello.');
    expect(store.transcript[0]).toMatchObject({ text: 'Hello.', spoken: false });
  });

  it('splits a long line into capped utterances but posts it whole', async () => {
    const store = fakeStore();
    const speaker = fakeSpeaker();
    const long = `${'Sentence here. '.repeat(120)}`;
    await say(fakeConciergeDeps({ store, speaker }), long);

    expect(store.transcript[0]?.text).toBe(long);
    // Two: what fits, and the "…and more in the thread" notice.
    expect(speaker.spoken).toHaveLength(2);
    expect(speaker.spoken[1]).toBe('and more in the thread.');
  });
});

describe('matchRepoByName', () => {
  const repos = [repoFixture(), repoFixture({ id: 'r2', name: 'bilo-mono' })];

  it('matches a whole name, case-insensitively', () => {
    expect(matchRepoByName(repos, 'BILO-MONO')?.id).toBe('r2');
  });

  it('falls back to a substring', () => {
    expect(matchRepoByName(repos, 'mono')?.id).toBe('r2');
  });

  it('prefers an exact match over a substring one', () => {
    const ambiguous = [repoFixture({ id: 'a', name: 'studio-extras' }), repoFixture({ id: 'b', name: 'studio' })];
    expect(matchRepoByName(ambiguous, 'studio')?.id).toBe('b');
  });

  it('returns null for nothing and for no match', () => {
    expect(matchRepoByName(repos, '   ')).toBeNull();
    expect(matchRepoByName(repos, 'nothing like it')).toBeNull();
  });
});
