import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sources(p) : p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
  });
}

describe('guard never escalates', () => {
  it('no check or probe runs sudo (a fix that needs root is text the user copies)', () => {
    for (const file of sources(__dirname)) {
      const code = readFileSync(file, 'utf8')
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && !/fix: \{.*command:/.test(l) && !/^\s*\{ key:/.test(l));
      expect(code.filter((l) => /exec\(\s*['"`]sudo|execFile\(\s*['"`]sudo|\bsudo\b.*spawn/.test(l)), file).toEqual([]);
    }
  });
});
