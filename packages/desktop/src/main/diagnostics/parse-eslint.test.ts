import { describe, expect, it } from 'vitest';

import { createEslintStream } from './parse-eslint';

const WORKDIR = '/repo';

/** Feed a whole payload in one chunk. */
function parseAll(payload: string, rowCap?: number) {
  const sink = createEslintStream({ workdir: WORKDIR, ...(rowCap === undefined ? {} : { rowCap }) });
  sink.push(payload);
  return sink.finish();
}

const file = (path: string, messages: unknown[]): unknown => ({
  filePath: `${WORKDIR}/${path}`,
  messages,
});

const error = (rule: string) => ({ ruleId: rule, severity: 2, message: 'boom', line: 3, column: 7 });
const warn = (rule: string) => ({ ruleId: rule, severity: 1, message: 'meh', line: 1, column: 1 });

describe('a well-formed report', () => {
  it('reports a clean repo as a success with zero counts', () => {
    // Distinct from every failure arm — "nothing to report" is an answer.
    const result = parseAll('[]');
    expect(result).toEqual({ ok: true, errorCount: 0, warningCount: 0, rows: [], withheld: 0 });
  });

  it('counts errors and warnings separately', () => {
    const result = parseAll(JSON.stringify([file('a.ts', [error('no-x'), warn('no-y'), warn('no-z')])]));
    expect(result.ok && result.errorCount).toBe(1);
    expect(result.ok && result.warningCount).toBe(2);
  });

  it('makes paths repo-relative and POSIX-shaped', () => {
    const result = parseAll(JSON.stringify([file('src/deep/a.ts', [error('r')])]));
    expect(result.ok && result.rows[0]?.file).toBe('src/deep/a.ts');
  });

  it('leaves a path outside the checkout absolute', () => {
    // Showing "../../../etc/x" would hide that the linter was pointed somewhere
    // unexpected; the absolute path says so plainly.
    const result = parseAll(JSON.stringify([{ filePath: '/elsewhere/a.ts', messages: [error('r')] }]));
    expect(result.ok && result.rows[0]?.file).toBe('/elsewhere/a.ts');
  });

  it('keeps a fatal parse error, which has no rule', () => {
    const payload = [file('a.ts', [{ fatal: true, severity: 2, message: 'Parsing error', line: 1 }])];
    const result = parseAll(JSON.stringify(payload));
    expect(result.ok && result.rows[0]?.ruleId).toBeNull();
    expect(result.ok && result.rows[0]?.column).toBe(0);
  });
});

describe('totality', () => {
  it('drops a message with an unknown severity rather than guessing', () => {
    // Severity 0 is "rule off" and must never be promoted to an error.
    const payload = [file('a.ts', [{ ruleId: 'r', severity: 0, message: 'off' }, error('real')])];
    const result = parseAll(JSON.stringify(payload));
    expect(result.ok && result.errorCount).toBe(1);
    expect(result.ok && result.warningCount).toBe(0);
  });

  it('drops a message with no text', () => {
    const payload = [file('a.ts', [{ ruleId: 'r', severity: 2 }, error('real')])];
    expect(parseAll(JSON.stringify(payload))).toMatchObject({ errorCount: 1 });
  });

  it('drops an element that is not a file result', () => {
    const payload = [null, 'nonsense', 42, file('a.ts', [error('r')])];
    expect(parseAll(JSON.stringify(payload))).toMatchObject({ ok: true, errorCount: 1 });
  });

  it('survives one malformed element among well-formed ones', () => {
    const good = JSON.stringify(file('a.ts', [error('r')]));
    expect(parseAll(`[${good}, {"filePath": broken}, ${good}]`)).toMatchObject({ errorCount: 2 });
  });
});

describe('the difference between failure and cleanliness', () => {
  it('fails when the tool printed text instead of JSON', () => {
    // The trap this whole design exists to avoid: a command that errored must
    // never be indistinguishable from a repository with no problems.
    const result = parseAll('Error: cannot find module\n');
    expect(result.ok).toBe(false);
  });

  it('fails on empty output', () => {
    expect(parseAll('').ok).toBe(false);
  });

  it('fails when the array never closes', () => {
    // A process killed mid-report. Truncating silently would undercount.
    expect(parseAll(`[${JSON.stringify(file('a.ts', [error('r')]))},`).ok).toBe(false);
  });

  it('fails rather than undercount when one element is absurdly large', () => {
    const sink = createEslintStream({ workdir: WORKDIR });
    sink.push('[{"filePath":"/repo/a.ts","messages":[');
    for (let i = 0; i < 40; i += 1) sink.push(`{"padding":"${'x'.repeat(200_000)}"},`);
    expect(sink.finish().ok).toBe(false);
  });
});

describe('streaming', () => {
  it('produces the same result whatever the chunk boundaries', () => {
    const payload = JSON.stringify([
      file('a.ts', [error('no-x'), warn('no-y')]),
      file('b.ts', [error('no-z')]),
    ]);
    const whole = parseAll(payload);

    for (const size of [1, 3, 17, 64]) {
      const sink = createEslintStream({ workdir: WORKDIR });
      for (let i = 0; i < payload.length; i += size) sink.push(payload.slice(i, i + size));
      expect(sink.finish()).toEqual(whole);
    }
  });

  it('is not confused by braces and brackets inside strings', () => {
    // A lint message quoting code is the obvious way a naive depth counter
    // desynchronises and swallows the rest of the report.
    const payload = JSON.stringify([
      file('a.ts', [{ ruleId: 'r', severity: 2, message: 'Unexpected "}" in `[{`', line: 1, column: 1 }]),
      file('b.ts', [error('r2')]),
    ]);
    expect(parseAll(payload)).toMatchObject({ ok: true, errorCount: 2 });
  });

  it('is not confused by an escaped quote inside a message', () => {
    const payload = JSON.stringify([
      file('a.ts', [{ ruleId: 'r', severity: 2, message: 'say \\" then }', line: 1, column: 1 }]),
      file('b.ts', [error('r2')]),
    ]);
    expect(parseAll(payload)).toMatchObject({ ok: true, errorCount: 2 });
  });
});

describe('the row cap', () => {
  it('keeps counts complete while capping the list', () => {
    const messages = Array.from({ length: 50 }, (_, i) => warn(`rule-${i}`));
    const result = parseAll(JSON.stringify([file('a.ts', messages)]), 10);
    expect(result.ok && result.warningCount).toBe(50);
    expect(result.ok && result.rows).toHaveLength(10);
    expect(result.ok && result.withheld).toBe(40);
  });

  it('reports nothing withheld when the list is the whole story', () => {
    expect(parseAll(JSON.stringify([file('a.ts', [error('r')])]), 10)).toMatchObject({ withheld: 0 });
  });

  it('favours errors over warnings so a wall of warnings cannot hide them', () => {
    // File order alone would let 10k warnings in one file bury every error in
    // the repository — the opposite of what the list is for.
    const noisy = file('a.ts', Array.from({ length: 100 }, (_, i) => warn(`w-${i}`)));
    const real = file('z.ts', [error('the-one')]);
    const result = parseAll(JSON.stringify([noisy, real]), 5);
    expect(result.ok && result.rows[0]?.ruleId).toBe('the-one');
    expect(result.ok && result.rows.filter((r) => r.severity === 'error')).toHaveLength(1);
  });
});
