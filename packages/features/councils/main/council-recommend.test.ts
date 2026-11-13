// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('./council-runner', () => ({ askOnce: vi.fn() }));

import { buildRecommendPrompt, parseRecommendation, recommendCouncil, type AskFn } from './council-recommend';

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
    if (!result.ok) expect(result.message).toContain('agy: timeout');
  });
});
