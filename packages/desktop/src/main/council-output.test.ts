import { describe, expect, it } from 'vitest';

import { appendCapped, cleanCapturedOutput } from './council-output';

describe('cleanCapturedOutput', () => {
  it('strips ANSI escape sequences', () => {
    const raw = '[32mgreen[0m text';
    expect(cleanCapturedOutput(raw, '')).toBe('green text');
  });

  it('collapses carriage-return redraws to the final frame', () => {
    const raw = 'Loading.\rLoading..\rLoading...\rDone!';
    expect(cleanCapturedOutput(raw, '')).toBe('Done!');
  });

  it('drops the echoed invocation line', () => {
    const raw = "claude -p 'hello'\nActual answer here.";
    expect(cleanCapturedOutput(raw, "claude -p 'hello'")).toBe('Actual answer here.');
  });

  it('is a no-op on the echo when the invocation is not found', () => {
    const raw = 'Answer without an echoed command.';
    expect(cleanCapturedOutput(raw, "codex exec 'x'")).toBe('Answer without an echoed command.');
  });

  it('trims boilerplate leading and trailing blank lines', () => {
    const raw = '\n\n  \nReal content\n\n\n';
    expect(cleanCapturedOutput(raw, '')).toBe('Real content');
  });
});

describe('appendCapped', () => {
  it('appends under the cap without truncating', () => {
    const { buffer, truncated } = appendCapped(new Uint8Array([1, 2]), new Uint8Array([3, 4]), 10);
    expect([...buffer]).toEqual([1, 2, 3, 4]);
    expect(truncated).toBe(false);
  });

  it('truncates a chunk that would exceed the cap', () => {
    const { buffer, truncated } = appendCapped(new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6]), 4);
    expect([...buffer]).toEqual([1, 2, 3, 4]);
    expect(truncated).toBe(true);
  });

  it('is a no-op once already at the cap', () => {
    const existing = new Uint8Array([1, 2, 3, 4]);
    const { buffer, truncated } = appendCapped(existing, new Uint8Array([5]), 4);
    expect(buffer).toBe(existing);
    expect(truncated).toBe(true);
  });
});
