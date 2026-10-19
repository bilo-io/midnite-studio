import { describe, expect, it } from 'vitest';
import { evaluate } from './audit.mjs';

const report = {
  advisories: {
    1: { id: 1, github_advisory_id: 'GHSA-aaaa-bbbb-cccc', module_name: 'left-pad', severity: 'high', title: 'bad' },
    2: { id: 2, github_advisory_id: 'GHSA-dddd-eeee-ffff', module_name: 'lodash', severity: 'low', title: 'meh' },
  },
};
const now = new Date('2026-10-19T00:00:00Z');

describe('evaluate', () => {
  it('fails on an unsuppressed high advisory and ignores low ones', () => {
    const r = evaluate(report, [], now);
    expect(r.ok).toBe(false);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toContain('GHSA-aaaa-bbbb-cccc');
  });

  it('passes when the advisory is suppressed and unexpired', () => {
    const s = [{ advisory: 'GHSA-aaaa-bbbb-cccc', package: 'left-pad', reason: 'dev only', expires: '2026-12-01' }];
    expect(evaluate(report, s, now)).toEqual({ ok: true, problems: [] });
  });

  it('fails an expired suppression and names the advisory', () => {
    const s = [{ advisory: 'GHSA-aaaa-bbbb-cccc', package: 'left-pad', reason: 'dev only', expires: '2026-10-01' }];
    const r = evaluate(report, s, now);
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toContain('GHSA-aaaa-bbbb-cccc');
    expect(r.problems.join('\n')).toContain('expired');
  });

  it('rejects a suppression without a valid date', () => {
    const r = evaluate({ advisories: {} }, [{ advisory: 'x', package: 'p', reason: 'r' }], now);
    expect(r.ok).toBe(false);
  });
});
