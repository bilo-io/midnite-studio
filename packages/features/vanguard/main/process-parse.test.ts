import { describe, expect, it } from 'vitest';

import { HOME, PS_TABLE } from './__fixtures__/sensor-fixtures';
import { UNKNOWN_SIGNATURE } from './code-signing';
import { classifyProcess, newExecutables, parsePsTable, underAgentSession } from './process-parse';

const rows = parsePsTable(PS_TABLE);
const signed = { ...UNKNOWN_SIGNATURE, signed: true, accepted: true };

describe('ps table', () => {
  it('parses rows, including a comm with spaces, and drops the header', () => {
    expect(rows).toHaveLength(5);
    expect(rows.find((r) => r.pid === 600)).toMatchObject({
      comm: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      uid: 501,
    });
    expect(rows.find((r) => r.pid === 500)!.comm).toBe(`${HOME}/Library/Application Support/.x/x`);
    expect(rows.find((r) => r.pid === 700)).toMatchObject({
      comm: '/opt/homebrew/bin/node',
      args: 'node server.js',
    });
  });
  it('newExecutables skips system paths and known ones, and de-duplicates', () => {
    const known = new Set(['/opt/homebrew/bin/node']);
    const fresh = newExecutables(known, [...rows, rows[3]!]);
    expect(fresh.map((r) => r.comm)).toEqual([
      `${HOME}/Library/Application Support/.x/x`,
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ]);
  });
  it('walks ppid to find an agent session', () => {
    expect(underAgentSession(500, rows, new Set([400]))).toBe(true);
    expect(underAgentSession(600, rows, new Set([400]))).toBe(false);
    expect(underAgentSession(500, rows, new Set())).toBe(false);
  });
});

describe('classifyProcess', () => {
  const base = { home: HOME, agentSpawned: false, parentIsShell: false };
  it('unsigned + quarantined + shell under an agent session is critical', () => {
    const c = classifyProcess({
      ...base,
      path: '/Users/dev/Downloads/payload',
      signature: { ...UNKNOWN_SIGNATURE, quarantined: true },
      agentSpawned: true,
      parentIsShell: true,
    });
    expect(c.severity).toBe('critical');
  });
  it('unsigned from a dev tool path is info', () => {
    expect(
      classifyProcess({ ...base, path: '/opt/homebrew/bin/tool', signature: UNKNOWN_SIGNATURE })
        .severity,
    ).toBe('info');
    expect(
      classifyProcess({
        ...base,
        path: `${HOME}/p/node_modules/.bin/vite`,
        signature: UNKNOWN_SIGNATURE,
      }).severity,
    ).toBe('info');
  });
  it('unsigned + quarantined elsewhere, or hidden, is high; plain unsigned is medium; signed is nothing', () => {
    expect(
      classifyProcess({
        ...base,
        path: '/Users/dev/bin/x',
        signature: { ...UNKNOWN_SIGNATURE, quarantined: true },
      }).severity,
    ).toBe('high');
    expect(
      classifyProcess({ ...base, path: '/tmp/x', signature: UNKNOWN_SIGNATURE }).severity,
    ).toBe('high');
    expect(
      classifyProcess({ ...base, path: '/Users/dev/bin/x', signature: UNKNOWN_SIGNATURE }).severity,
    ).toBe('medium');
    expect(
      classifyProcess({ ...base, path: '/Applications/A.app/A', signature: signed }).severity,
    ).toBeNull();
  });
});
