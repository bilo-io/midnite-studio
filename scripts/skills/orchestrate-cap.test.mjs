// Cap state machine, --queued/--max/--chart and the tail-only transcript read (vitest/node).
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { capLine, chartBlock, clampMax, contextTokens, main, nextCap, readTail } from './orchestrate-cap.mjs';

describe('cap', () => {
  it('capLine adds queued only when there is a queue', () => {
    expect(capLine(3, 2)).toBe('🤖 Subagent CAP: 3 (2 running)');
    expect(capLine(3, 2, 4)).toBe('🤖 Subagent CAP: 3 (2 running, 4 queued)');
  });
  it('--max clamps raises but never lowers below the floor', () => {
    expect(nextCap({ cap: 4, lowStreak: 1, cpu: 10, ram: 10, max: 4 }).cap).toBe(4);
    expect(nextCap({ cap: 4, lowStreak: 1, cpu: 10, ram: 10, max: 5 }).cap).toBe(5);
    expect(nextCap({ cap: 6, cpu: 50, ram: 50, max: 3 }).cap).toBe(3);
    expect(clampMax(1)).toBe(2);
    expect(clampMax('x')).toBe(6);
  });
  it('chartBlock is three lines with 10-cell bars and CAP x/6', () => {
    const lines = chartBlock({ cpu: 30, ram: 90, cap: 2, running: 1, queued: 2 }).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('🩺 Machine');
    expect(lines[0]).toContain('███░░░░░░░');
    expect(lines[0]).toContain('█████████░');
    expect(lines[1]).toContain('CAP ██░░░░ 2/6');
    expect(lines[2]).toContain('(1 running, 2 queued)');
  });
  it('main prints the chart and passes flags through', () => {
    const out = [];
    main(['--cpu', '10', '--ram', '10', '--chart', '--queued', '1', '--json'], { out: (s) => out.push(s) });
    const j = JSON.parse(out[0]);
    expect(j.chart).toContain('CAP');
    expect(j.line).toContain('1 queued');
  });
});

describe('transcript tail', () => {
  const rec = (n) => JSON.stringify({ message: { usage: { input_tokens: n } } });
  it('reads only the tail but still finds the latest usage', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cap-'));
    const f = join(dir, 't.jsonl');
    const filler = 'x'.repeat(200);
    writeFileSync(f, [rec(1), ...Array.from({ length: 2000 }, () => filler), rec(777)].join('\n'));
    const tail = readTail(f, { maxBytes: 4096, maxLines: 300 });
    expect(tail.length).toBeLessThan(5000);
    expect(contextTokens(tail)).toBe(777);
    expect(readTail(f, { maxBytes: 1 << 20, maxLines: 3 }).split('\n')).toHaveLength(3);
  });
});
