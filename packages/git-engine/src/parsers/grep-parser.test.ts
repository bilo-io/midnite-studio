import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGrep } from './grep-parser';

describe('parseGrep', () => {
  it('parses fixture grep-z-context.txt correctly', () => {
    const fixturePath = path.join(__dirname, '__fixtures__/grep-z-context.txt');
    const content = fs.readFileSync(fixturePath, 'utf8');

    const matches = parseGrep(content);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    const targetHit = matches.find((h) => h.text.includes('target'));
    expect(targetHit).toBeDefined();
    expect(targetHit?.path).toContain('src/example.ts');
    expect(targetHit?.line).toBe(2);
  });

  it('handles CRLF line endings cleanly', () => {
    const payload = 'file.ts\x001\x00hello world\r\n';
    const matches = parseGrep(payload);
    expect(matches).toEqual([
      { path: 'file.ts', line: 1, kind: 'match', text: 'hello world' },
    ]);
  });
});

