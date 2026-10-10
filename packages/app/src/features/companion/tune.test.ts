/**
 * Vitest/jsdom: the "tune me" flow end to end over fake ports (Phase 109
 * Theme H) — interview, compose (CLI and template), read-back, confirm, and
 * tweaks with and without a CLI. No browser capability needed: speech is a
 * recording fake and the CLI is a promise.
 */
import {
  COMPANION_TUNE_QUESTIONS,
  failure,
  ok,
  type CompanionPersonaReply,
  type CompanionPersonaRequest,
  type CompanionTuneTarget,
  type GitOpResult,
} from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { currentTuneSession } from './tune-interview';
import { fakeConciergeDeps, fakeStore, type FakeStore } from './test-doubles';
import {
  TWEAK_NEEDS_CLI,
  continueTune,
  resetTuneStateForTest,
  startTuneInterview,
  startTuneTweak,
  type TuneDeps,
  type TunePort,
} from './tune';

const PERSONALITY = COMPANION_TUNE_QUESTIONS.companionPersonality.map((q) => q.ask);

type Harness = {
  deps: TuneDeps;
  store: FakeStore;
  port: TunePort & {
    requests: CompanionPersonaRequest[];
    replaced: { target: CompanionTuneTarget; text: string }[];
    offered: string[];
  };
};

function harness(
  over: {
    cli?: boolean;
    persona?: (request: CompanionPersonaRequest) => Promise<GitOpResult<CompanionPersonaReply>>;
    current?: string;
    signal?: AbortSignal;
  } = {},
): Harness {
  const store = fakeStore();
  const requests: CompanionPersonaRequest[] = [];
  const replaced: { target: CompanionTuneTarget; text: string }[] = [];
  const offered: string[] = [];
  const port = {
    requests,
    replaced,
    offered,
    persona: async (request: CompanionPersonaRequest) => {
      requests.push(request);
      return over.persona
        ? over.persona(request)
        : ok({ text: 'Keep it warm and a bit dry. No jargon.', summary: 'Warm, a bit dry, no jargon.' });
    },
    hasAgentCli: () => over.cli ?? true,
    currentText: () => over.current ?? '',
    askToReplace: async (target: CompanionTuneTarget, text: string) => {
      replaced.push({ target, text });
    },
    offerSettingsPage: async (line: string) => {
      offered.push(line);
    },
  };
  const deps: TuneDeps = {
    ...fakeConciergeDeps({ store, ...(over.signal ? { signal: over.signal } : {}) }),
    tune: port,
  };
  return { deps, store, port };
}

/** Post the user's turn the way `submitInput` does, then hand it to the flow. */
async function reply(h: Harness, text: string): Promise<boolean> {
  h.store.addTurn({ role: 'user', text, spoken: false });
  return continueTune(text, h.deps);
}

const companionLines = (h: Harness) =>
  h.store.transcript.filter((turn) => turn.role === 'companion').map((turn) => turn.text);

afterEach(() => resetTuneStateForTest());

describe('continueTune with nothing open', () => {
  it('passes the line on', async () => {
    const h = harness();
    expect(await continueTune('push', h.deps)).toBe(false);
    expect(h.store.transcript).toEqual([]);
  });
});

describe('the interview, with an agent CLI', () => {
  it('asks each question in turn, writes from the answers, and reads back the summary with the full text posted', async () => {
    const h = harness({ current: 'Tone: formal.' });
    await startTuneInterview('companionPersonality', h.deps);
    expect(companionLines(h).at(-1)).toContain(PERSONALITY[0]);

    for (const [index, answer] of ['Warm and a bit dry', 'Just the essentials', 'a little'].entries()) {
      expect(await reply(h, answer)).toBe(true);
      expect(companionLines(h).at(-1)).toBe(PERSONALITY[index + 1]);
    }
    await reply(h, 'No jargon.');

    expect(h.port.requests).toEqual([
      {
        mode: 'interview',
        target: 'companionPersonality',
        answers: [
          { topic: 'the tone to take', answer: 'Warm and a bit dry' },
          { topic: 'how much to say', answer: 'just the essentials' },
          { topic: 'humour', answer: 'a little' },
          { topic: 'what to avoid', answer: 'jargon' },
        ],
        current: 'Tone: formal.',
      },
    ]);
    const review = h.store.transcript.at(-1);
    expect(review?.text).toBe(
      "Here's the gist: Warm, a bit dry, no jargon. Want to hear all of it?\n\n> Keep it warm and a bit dry. No jargon.",
    );
    expect(currentTuneSession()).toMatchObject({ stage: 'hearAll', origin: 'interview' });
    // Thinking while the CLI wrote, and settled after.
    expect(h.store.events).toEqual(['submit', 'settle']);
  });

  it('speaks only the summary and the question, never the whole draft, before asking', async () => {
    const speaker = { available: true as const, speak: vi.fn(async () => {}), cancel: vi.fn(), isSpeaking: () => false };
    const h = harness();
    const deps = { ...h.deps, speaker };
    await startTuneInterview('companionPersonality', deps);
    for (const answer of ['dry', 'skip', 'skip', 'skip']) {
      h.store.addTurn({ role: 'user', text: answer, spoken: false });
      await continueTune(answer, deps);
    }
    const spoken = speaker.speak.mock.calls.map((call) => (call as unknown as [string])[0]).join(' ');
    expect(spoken).toContain("Here's the gist: Warm, a bit dry, no jargon.");
    expect(spoken).toContain('Want to hear all of it?');
    expect(spoken).not.toContain('Keep it warm and a bit dry. No jargon.');
  });

  it('reads all of it on yes, then asks to replace through the confirm tier', async () => {
    const h = harness();
    await startTuneInterview('companionPersonality', h.deps);
    for (const answer of ['dry', 'skip', 'skip', 'skip']) await reply(h, answer);
    await reply(h, 'yes');
    expect(companionLines(h).at(-1)).toBe('Keep it warm and a bit dry. No jargon.');
    expect(h.port.replaced).toEqual([
      { target: 'companionPersonality', text: 'Keep it warm and a bit dry. No jargon.' },
    ]);
    expect(currentTuneSession()).toBeNull();
  });

  it('goes straight to the confirm on no', async () => {
    const h = harness();
    await startTuneInterview('companionAboutUser', h.deps);
    for (const answer of ['Call me Bilo', 'skip', 'skip']) await reply(h, answer);
    const before = companionLines(h).length;
    await reply(h, 'no thanks');
    expect(companionLines(h)).toHaveLength(before);
    expect(h.port.replaced).toHaveLength(1);
  });

  it('falls back to the template when the CLI fails, and says so once', async () => {
    const h = harness({ persona: async () => failure('That took too long, so I stopped waiting.') });
    await startTuneInterview('companionPersonality', h.deps);
    for (const answer of ['dry', 'skip', 'plenty', 'skip']) await reply(h, answer);
    expect(h.store.transcript.at(-1)?.text).toBe(
      "I've filled in the basic template from your answers. Here's the gist: Tone: dry. Want to hear all of it?\n\n> Tone: dry. Humour: plenty.",
    );
    await reply(h, 'no');
    expect(h.port.replaced).toEqual([{ target: 'companionPersonality', text: 'Tone: dry. Humour: plenty.' }]);
  });

  it('cancels at a question without asking anything of the CLI or the setter', async () => {
    const h = harness();
    await startTuneInterview('companionPersonality', h.deps);
    await reply(h, 'dry');
    await reply(h, 'cancel');
    expect(companionLines(h).at(-1)).toBe("Okay, I've left my personality as it was.");
    expect(h.port.requests).toEqual([]);
    expect(h.port.replaced).toEqual([]);
    expect(await continueTune('push', h.deps)).toBe(false);
  });

  it('starts over from the first question, forgetting earlier answers', async () => {
    const h = harness();
    await startTuneInterview('companionPersonality', h.deps);
    await reply(h, 'formal');
    await reply(h, 'start over');
    expect(companionLines(h).at(-1)).toBe(`Starting over. ${PERSONALITY[0]}`);
    for (const answer of ['dry', 'skip', 'skip', 'skip']) await reply(h, answer);
    expect(h.port.requests[0]).toMatchObject({ answers: [{ topic: 'the tone to take', answer: 'dry' }] });
  });

  it('writes nothing when every question is skipped', async () => {
    const h = harness();
    await startTuneInterview('companionAboutUser', h.deps);
    for (const answer of ['skip', 'skip', 'skip']) await reply(h, answer);
    expect(companionLines(h).at(-1)).toBe("You skipped every question, so I've left what I know about you as it was.");
    expect(h.port.requests).toEqual([]);
  });
});

describe('the interview, with no agent CLI (Decision 6)', () => {
  it('fills the template without asking a CLI at all', async () => {
    const h = harness({ cli: false });
    await startTuneInterview('companionAboutUser', h.deps);
    for (const answer of ['Call me Bilo', 'I work on the desktop app', 'short']) await reply(h, answer);
    expect(h.port.requests).toEqual([]);
    expect(h.store.transcript.at(-1)?.text).toBe(
      "I've filled in the basic template from your answers. Here's the gist: Call me Bilo. Want to hear all of it?\n\n" +
        '> Call me Bilo. I work on the desktop app. How I like updates: short.',
    );
  });
});

describe('a reply while the draft is still being written', () => {
  it('waits for the same draft rather than asking the CLI twice', async () => {
    let resolve: (value: GitOpResult<CompanionPersonaReply>) => void = () => {};
    const pending = new Promise<GitOpResult<CompanionPersonaReply>>((done) => {
      resolve = done;
    });
    const first = new AbortController();
    const h = harness({ persona: () => pending, signal: first.signal });
    await startTuneInterview('companionPersonality', h.deps);
    for (const answer of ['dry', 'skip', 'skip']) await reply(h, answer);
    const writing = reply(h, 'skip');
    await Promise.resolve();

    // The next line aborts the first flow (as `runtime.ts`'s `begin` does) and runs in its own.
    first.abort();
    const second: TuneDeps = { ...h.deps, signal: new AbortController().signal };
    h.store.addTurn({ role: 'user', text: 'hello?', spoken: false });
    const waiting = continueTune('hello?', second);
    resolve(ok({ text: 'Dry.', summary: 'Dry.' }));
    await Promise.all([writing, waiting]);

    expect(h.port.requests).toHaveLength(1);
    const lines = companionLines(h);
    expect(lines).toContain('Still writing it — one moment. Say cancel to drop it.');
    expect(lines.filter((line) => line.startsWith("Here's the gist: Dry."))).toHaveLength(1);
  });

  it('drops the draft when cancelled meanwhile', async () => {
    let resolve: (value: GitOpResult<CompanionPersonaReply>) => void = () => {};
    const pending = new Promise<GitOpResult<CompanionPersonaReply>>((done) => {
      resolve = done;
    });
    const h = harness({ persona: () => pending });
    const tweaking = startTuneTweak('be more sarcastic', h.deps);
    await Promise.resolve();
    // `startTuneTweak` is still awaiting the CLI; cancel from "another" flow.
    await reply(h, 'cancel');
    resolve(ok({ text: 'Sarcastic.', summary: 'Sarcastic.' }));
    await tweaking;
    expect(companionLines(h).some((line) => line.includes("Here's the gist"))).toBe(false);
    expect(currentTuneSession()).toBeNull();
  });
});

describe('tweaks', () => {
  it('sends the instruction and the current personality, then reads back like an interview', async () => {
    const h = harness({
      current: 'Tone: dry.',
      persona: async () => ok({ text: 'Tone: dry and sarcastic.', summary: 'Drier, and sarcastic now.' }),
    });
    await startTuneTweak('be more sarcastic', h.deps);
    expect(h.port.requests).toEqual([
      { mode: 'tweak', target: 'companionPersonality', instruction: 'be more sarcastic', current: 'Tone: dry.' },
    ]);
    expect(companionLines(h)).toEqual([
      'Give me a moment to rework that.',
      "Here's the gist: Drier, and sarcastic now. Want to hear all of it?\n\n> Tone: dry and sarcastic.",
    ]);
    await reply(h, 'nah');
    expect(h.port.replaced).toEqual([{ target: 'companionPersonality', text: 'Tone: dry and sarcastic.' }]);
  });

  it('points to the page with no agent CLI, and opens no session', async () => {
    const h = harness({ cli: false });
    await startTuneTweak('be more sarcastic', h.deps);
    expect(h.port.offered).toEqual([TWEAK_NEEDS_CLI]);
    expect(TWEAK_NEEDS_CLI).toBe('I need an agent CLI for that — want me to open Settings, Companion?');
    expect(h.port.requests).toEqual([]);
    expect(currentTuneSession()).toBeNull();
  });

  it('says why and changes nothing when the CLI fails — a tweak has no template', async () => {
    const h = harness({ persona: async () => failure('That took too long, so I stopped waiting.') });
    await startTuneTweak('talk less', h.deps);
    expect(companionLines(h).at(-1)).toBe(
      "That took too long, so I stopped waiting. I've left my personality as it was.",
    );
    expect(h.port.replaced).toEqual([]);
    expect(currentTuneSession()).toBeNull();
  });

  it('ends on "start over" — there is nothing to start over from', async () => {
    const h = harness();
    await startTuneTweak('be funnier', h.deps);
    await reply(h, 'start over');
    expect(companionLines(h).at(-1)).toBe("Okay, I've left my personality as it was.");
    expect(currentTuneSession()).toBeNull();
  });
});
