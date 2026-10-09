import type { ChatMessage } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import {
  TRANSCRIPT_CHAR_CAP,
  UNAPPLIED_EDITS_NOTE,
  buildOllamaMessages,
  buildTurnPrompt,
  hasUnappliedEdits,
  renderTranscript,
  userContent,
} from './chat-prompt';

const msg = (role: 'user' | 'assistant', text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `${role}-${text.slice(0, 4)}`,
  role,
  text,
  createdAt: 1,
  status: 'done',
  ...extra,
});

describe('buildTurnPrompt', () => {
  it('sends just the new message when the engine resumed its own session', () => {
    const history = [msg('user', 'first'), msg('assistant', 'answer')];
    expect(buildTurnPrompt({ history, message: msg('user', 'second'), resumed: true })).toBe('second');
  });

  it('replays the thread as a transcript when it did not resume', () => {
    const history = [msg('user', 'first'), msg('assistant', 'answer')];
    const prompt = buildTurnPrompt({ history, message: msg('user', 'second'), resumed: false });
    expect(prompt).toContain('<conversation>');
    expect(prompt).toContain('User:\nfirst');
    expect(prompt).toContain('Assistant:\nanswer');
    expect(prompt.endsWith('Final message from the user:\nsecond')).toBe(true);
  });

  it('is just the message for a first turn', () => {
    expect(buildTurnPrompt({ history: [], message: msg('user', 'hello'), resumed: false })).toBe('hello');
  });

  it('inlines attachments as fenced files', () => {
    const text = userContent({ text: 'look', attachments: [{ id: 'a', name: 'a.ts', text: 'const x = 1;' }] });
    expect(text).toContain('Attached file "a.ts"');
    expect(text).toContain('```\nconst x = 1;\n```');
  });

  it('drops failed and empty assistant turns from the replay', () => {
    const history = [msg('user', 'q'), msg('assistant', 'partial', { status: 'error' }), msg('assistant', '')];
    expect(renderTranscript(history)).toBe('User:\nq');
  });

  it('drops the oldest turns first when the transcript is too long', () => {
    const big = 'x'.repeat(TRANSCRIPT_CHAR_CAP / 2);
    const history = [msg('user', `old-${big}`), msg('assistant', `mid-${big}`), msg('user', 'newest question')];
    const transcript = renderTranscript(history);
    expect(transcript).toContain('newest question');
    expect(transcript).not.toContain('old-');
  });

  it('tells a resuming model when its earlier edits were not all applied', () => {
    const rejected = msg('assistant', 'done', {
      changeSet: { id: 'cs', createdAt: 1, status: 'rejected', files: [] },
    });
    expect(hasUnappliedEdits([rejected])).toBe(true);
    const prompt = buildTurnPrompt({ history: [msg('user', 'q'), rejected], message: msg('user', 'next'), resumed: true });
    expect(prompt.startsWith(UNAPPLIED_EDITS_NOTE)).toBe(true);
    expect(prompt.endsWith('next')).toBe(true);
  });

  it('says nothing about edits that were all accepted', () => {
    const accepted = msg('assistant', 'done', { changeSet: { id: 'cs', createdAt: 1, status: 'accepted', files: [] } });
    expect(hasUnappliedEdits([accepted])).toBe(false);
  });
});

describe('buildOllamaMessages', () => {
  it('is the whole thread then the new message, as role/content pairs', () => {
    const out = buildOllamaMessages([msg('user', 'a'), msg('assistant', 'b')], msg('user', 'c'));
    expect(out).toEqual([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
    ]);
  });
});
