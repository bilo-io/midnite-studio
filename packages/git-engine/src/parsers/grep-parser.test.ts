import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGrep } from './grep-parser';

describe('parseGrep', () => {
  it('parses fixture grep-z-context.txt, marking the hit as a match and its neighbours as context', () => {
    const fixturePath = path.join(__dirname, '__fixtures__/grep-z-context.txt');
    const content = fs.readFileSync(fixturePath, 'utf8');

    // `-z` gives match and context lines identical bytes (see `parseGrep`'s
    // doc comment) — `isMatch` is how the caller re-derives which is which.
    const matches = parseGrep(content, (text) => text.includes('target'));
    expect(matches).toHaveLength(3);
    expect(matches.map((m) => m.kind)).toEqual(['context', 'match', 'context']);

    const targetHit = matches.find((h) => h.kind === 'match');
    expect(targetHit).toBeDefined();
    expect(targetHit?.text).toContain('target');
    expect(targetHit?.path).toBe('src/example.ts');
    expect(targetHit?.line).toBe(2);
  });

  it('handles CRLF line endings cleanly', () => {
    const payload = 'file.ts\x001\x00hello world\r\n';
    const matches = parseGrep(payload);
    expect(matches).toEqual([
      { path: 'file.ts', line: 1, kind: 'match', text: 'hello world' },
    ]);
  });

  it('splits on the NUL field separators, never on a colon inside the path', () => {
    const payload = 'src/a:b.ts\x003\x00needle found here\n';
    const matches = parseGrep(payload);
    expect(matches).toEqual([
      { path: 'src/a:b.ts', line: 3, kind: 'match', text: 'needle found here' },
    ]);
  });

  it('keeps the last record when the payload has no trailing newline', () => {
    const payload = 'file.ts\x005\x00last line, no trailing newline';
    const matches = parseGrep(payload);
    expect(matches).toEqual([
      { path: 'file.ts', line: 5, kind: 'match', text: 'last line, no trailing newline' },
    ]);
  });

  it('returns an empty array for an empty payload, without throwing', () => {
    expect(() => parseGrep('')).not.toThrow();
    expect(parseGrep('')).toEqual([]);
  });
});
