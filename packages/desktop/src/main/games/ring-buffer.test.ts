import { describe, expect, it } from 'vitest';

import { GAME_LOG_CAPACITY, GAME_LOG_TEXT_MAX } from '@midnite/studio-shared';

import { LogRingBuffer } from './ring-buffer';

describe('LogRingBuffer', () => {
  it('is capped at 2000 entries by default', () => {
    expect(GAME_LOG_CAPACITY).toBe(2000);
    const buffer = new LogRingBuffer();
    for (let i = 0; i < 2500; i++) buffer.push({ level: 'log', text: `line ${i}` });
    expect(buffer.size).toBe(2000);
    // The oldest 500 were evicted; the retained window is 501..2500.
    expect(buffer.entriesSince()[0]?.seq).toBe(501);
    expect(buffer.lastSeq).toBe(2500);
  });

  it('keeps seq monotonic past evictions so `since` is a cursor', () => {
    const buffer = new LogRingBuffer(3);
    for (let i = 0; i < 5; i++) buffer.push({ level: 'log', text: String(i) });
    expect(buffer.entriesSince(3).map((entry) => entry.text)).toEqual(['3', '4']);
    expect(buffer.entriesSince(5)).toEqual([]);
    expect(buffer.entriesSince().map((entry) => entry.seq)).toEqual([3, 4, 5]);
  });

  it('truncates long text with an ellipsis', () => {
    const buffer = new LogRingBuffer();
    const entry = buffer.push({ level: 'error', text: 'x'.repeat(GAME_LOG_TEXT_MAX + 50) });
    expect(entry.text).toHaveLength(GAME_LOG_TEXT_MAX);
    expect(entry.text.endsWith('…')).toBe(true);
  });

  it('stamps the time it was pushed', () => {
    const buffer = new LogRingBuffer();
    expect(buffer.push({ level: 'log', text: 'a' }, 1234).at).toBe(1234);
  });
});
