// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('./council-runner', () => ({ askOnce: vi.fn() }));

import {
  buildGeneratePrompt,
  buildRecommendPrompt,
  generateCouncil,
  modelAvailability,
  parseGenerated,
  parseRecommendation,
  recommendCouncil,
  type AskFn,
} from './council-recommend';

const GOOD = JSON.stringify({
  description: 'Weighs a launch.',
  synthProvider: 'claude',
  members: [
    { name: 'Optimist', role: 'Argue for it.', provider: 'agy' },
    { name: 'Skeptic', role: 'Argue against it.', provider: 'gemini' },
  ],
});

describe('recommend a council (Phase 133 Theme E)', () => {
  it('names only the installed providers in its prompt', () => {
    const prompt = buildRecommendPrompt('Launch', 'should we ship', ['agy', 'claude']);
    expect(prompt).toContain('agy, claude');
    expect(prompt).toContain('should we ship');
  });

  it('parses a fenced answer and coerces an unknown provider to the one that answered', () => {
    const parsed = parseRecommendation('```json\n' + GOOD + '\n```', ['agy', 'claude'], 'claude');
    expect(parsed?.members.map((m) => m.provider)).toEqual(['agy', 'claude']);
    expect(parsed?.synthProvider).toBe('claude');
  });

  it('rejects an answer that is not a council', () => {
    expect(parseRecommendation('no json here', ['agy'], 'agy')).toBeNull();
    expect(parseRecommendation('{"members":[]}', ['agy'], 'agy')).toBeNull();
  });

  it('tries the fastest installed provider first and falls through on failure', async () => {
    const ask = vi.fn<AskFn>()
      .mockResolvedValueOnce({ status: 'failed', text: '', truncated: false, error: 'not authed' })
      .mockResolvedValueOnce({ status: 'succeeded', text: GOOD, truncated: false });
    const result = await recommendCouncil({ name: 'Launch', providers: ['agy', 'claude'] }, ask);
    expect(result.ok).toBe(true);
    expect(ask.mock.calls.map(([provider, model]) => [provider, model])).toEqual([
      ['claude', 'haiku'],
      ['agy', 'gemini-3.8-flash-low'],
    ]);
  });

  it('says why when every provider fails', async () => {
    const ask = vi.fn<AskFn>().mockResolvedValue({ status: 'timeout', text: '', truncated: false });
    const result = await recommendCouncil({ name: 'Launch', providers: ['agy'] }, ask);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok && result.kind === 'error') expect(result.message).toContain('agy: timeout');
  });
});

describe('recommend held to the cap and the catalogue (Phase 134)', () => {
  it('proposes at most the member cap and asks for no more', () => {
    expect(buildRecommendPrompt('Launch', undefined, ['agy'], 3)).toContain('Propose 3 to 3 members');
    const many = JSON.stringify({
      synthProvider: 'agy',
      members: Array.from({ length: 5 }, (_, i) => ({ name: `M${i}`, role: 'r', provider: 'agy' })),
    });
    expect(parseRecommendation(many, ['agy'], 'agy', { maxMembers: 3 })?.members).toHaveLength(3);
  });

  it('keeps a model only when it is available for that provider', () => {
    const answer = JSON.stringify({
      synthProvider: 'claude',
      members: [
        { name: 'A', role: 'r', provider: 'agy', model: 'gemini-3.8-flash-low' },
        { name: 'B', role: 'r', provider: 'agy', model: 'gpt-9' },
      ],
    });
    const models = modelAvailability([{ provider: 'agy', models: ['gemini-3.8-flash-low'] }]);
    const parsed = parseRecommendation(answer, ['agy', 'claude'], 'claude', { models });
    expect(parsed?.members.map((m) => m.model)).toEqual(['gemini-3.8-flash-low', undefined]);
  });
});

describe('generate a Custom council (Phase 134 Theme E)', () => {
  const available = [
    { provider: 'claude' as const, models: ['haiku-4-5'] },
    { provider: 'agy' as const, models: ['gemini-3.8-flash-low', 'not-in-the-catalogue'] },
  ];
  const ANSWER = JSON.stringify({
    instructions: 'Rank the ideas and pick one.',
    members: [
      { name: 'Scout', role: 'Find options.', provider: 'agy', model: 'gemini-3.8-flash-low' },
      { name: 'Judge', role: 'Pick one.', provider: 'grok', model: 'grok-4' },
      { name: 'Wild', role: 'Go big.', provider: 'agy', model: 'not-in-the-catalogue' },
      { name: 'Extra', role: 'One too many.', provider: 'claude', model: 'haiku-4-5' },
    ],
  });

  it('lists only the available providers and models in its prompt', () => {
    const prompt = buildGeneratePrompt({ name: 'Naming', topic: 'a name for the app', count: 3, available });
    expect(prompt).toContain('- claude: models haiku-4-5');
    expect(prompt).toContain('exactly 3 members');
    expect(prompt).toContain('a name for the app');
  });

  it('replaces an unavailable provider, drops an unknown model and clamps to the count', () => {
    const parsed = parseGenerated(ANSWER, available, 'claude', 3);
    expect(parsed?.instructions).toBe('Rank the ideas and pick one.');
    expect(parsed?.members.map((m) => [m.name, m.provider, m.model])).toEqual([
      ['Scout', 'agy', 'gemini-3.8-flash-low'],
      ['Judge', 'claude', undefined],
      ['Wild', 'agy', undefined],
    ]);
  });

  it('rejects an answer without instructions or members', () => {
    expect(parseGenerated('{"members":[]}', available, 'claude', 3)).toBeNull();
    expect(parseGenerated('nope', available, 'claude', 3)).toBeNull();
  });

  it('asks the fastest available CLI and falls through on a bad answer', async () => {
    const ask = vi.fn<AskFn>()
      .mockResolvedValueOnce({ status: 'succeeded', text: 'not json', truncated: false })
      .mockResolvedValueOnce({ status: 'succeeded', text: ANSWER, truncated: false });
    const result = await generateCouncil({ name: 'Naming', count: 2, providers: [...available].reverse() }, ask);
    expect(ask.mock.calls.map(([provider]) => provider)).toEqual(['claude', 'agy']);
    expect(result.ok && result.value.members).toHaveLength(2);
  });

  it('fails as an envelope when nothing is installed', async () => {
    expect(await generateCouncil({ name: 'x', count: 2, providers: [] })).toMatchObject({ ok: false });
  });
});
