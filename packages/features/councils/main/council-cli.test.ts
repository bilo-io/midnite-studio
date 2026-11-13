// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { councilCliArgs, councilScript, parseCouncilAnswer, scriptQuote } from './council-cli';

describe('councilCliArgs (Phase 133 Theme A)', () => {
  it('asks agy and claude for JSON, with the prompt flag last', () => {
    expect(councilCliArgs({ provider: 'agy', model: 'gemini-3.8-flash-low' })).toEqual([
      '--model',
      'gemini-3.8-flash-low',
      '--output-format',
      'json',
      '-p',
    ]);
    expect(councilCliArgs({ provider: 'claude', model: 'haiku', sessionId: 's-1' })).toEqual([
      '--model',
      'haiku',
      '--resume',
      's-1',
      '--output-format',
      'json',
      '-p',
    ]);
    expect(councilCliArgs({ provider: 'agy', sessionId: 'c-1' })).toContain('--conversation');
  });

  it('drops a default, unknown or Ollama-chosen model', () => {
    expect(councilCliArgs({ provider: 'agy', model: 'default' })).not.toContain('--model');
    expect(councilCliArgs({ provider: 'agy', model: 'gemini-2.5-flash' })).not.toContain('--model');
    expect(councilCliArgs({ provider: 'claude', model: 'haiku', allowModelFlag: false })).not.toContain('--model');
  });

  it('keeps codex and opencode on their plain print modes', () => {
    expect(councilCliArgs({ provider: 'codex' })).toEqual(['exec']);
    expect(councilCliArgs({ provider: 'opencode' })).toEqual(['run']);
  });
});

describe('parseCouncilAnswer', () => {
  it('reads agy JSON after any banner noise', () => {
    const out = `Loading…\n{"conversation_id":"c-1","status":"SUCCESS","response":"pong\\n"}`;
    expect(parseCouncilAnswer('agy', out, 0)).toEqual({ ok: true, text: 'pong', sessionId: 'c-1' });
  });

  it('reports a non-success agy status as failed', () => {
    const out = '{"conversation_id":"c-1","status":"ERROR","response":""}';
    expect(parseCouncilAnswer('agy', out, 0)).toMatchObject({ ok: false, error: expect.stringMatching(/ERROR/) });
  });

  it('reads claude JSON, and an is_error result as the error', () => {
    expect(parseCouncilAnswer('claude', '{"result":"hi","session_id":"s","is_error":false}', 0)).toEqual({ ok: true, text: 'hi', sessionId: 's' });
    expect(parseCouncilAnswer('claude', '{"result":"quota","is_error":true}', 1)).toMatchObject({ ok: false, error: 'quota' });
  });

  it('falls back to the text when there is no JSON, and fails an empty or non-zero exit', () => {
    expect(parseCouncilAnswer('codex', 'plain answer', 0)).toEqual({ ok: true, text: 'plain answer' });
    expect(parseCouncilAnswer('agy', '', 0)).toMatchObject({ ok: false });
    expect(parseCouncilAnswer('codex', 'boom', 2)).toMatchObject({ ok: false, error: 'Exited with code 2.' });
  });
});

describe('councilScript', () => {
  it('quotes every word and reads the prompt from its file with stdin closed', () => {
    expect(scriptQuote(`it's`)).toBe(`'it'\\''s'`);
    const script = councilScript(['agy', '-p'], '/tmp/x/prompt.txt');
    expect(script).toBe(`#!/bin/sh\nexec 'agy' '-p' "$(cat '/tmp/x/prompt.txt')" < /dev/null\n`);
  });
});
