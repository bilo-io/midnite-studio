// vitest/node: the ps parsers the kill action's blast radius and stale check read.
import { describe, expect, it } from 'vitest';

import { ancestorsOf, commMatches, parseEtime, parseGroupPs, parsePidArgs } from './process-table';

describe('parseEtime', () => {
  it('reads every etime shape', () => {
    expect(parseEtime('00:05')).toBe(5);
    expect(parseEtime('12:34')).toBe(754);
    expect(parseEtime('01:02:03')).toBe(3723);
    expect(parseEtime('2-01:02:03')).toBe(2 * 86_400 + 3723);
    expect(parseEtime('garbage')).toBeNull();
  });
});

describe('parseGroupPs', () => {
  it('keeps a comm with spaces whole', () => {
    const rows = parseGroupPs(
      [
        '  900     1   900   501   01:00:00 /Applications/Midnite Studio.app/Contents/MacOS/Midnite Studio',
        ' 4100  4000  4100   501      02:00 /tmp/evil',
        'not a row',
      ].join('\n'),
    );
    expect(rows).toEqual([
      { pid: 900, ppid: 1, pgid: 900, uid: 501, elapsedSeconds: 3600, comm: '/Applications/Midnite Studio.app/Contents/MacOS/Midnite Studio' },
      { pid: 4100, ppid: 4000, pgid: 4100, uid: 501, elapsedSeconds: 120, comm: '/tmp/evil' },
    ]);
  });
});

describe('parsePidArgs', () => {
  it('maps pid to the full command line', () => {
    expect(parsePidArgs(' 12 /usr/bin/node /x/broker.js --socket /s\n13 sh -c true\n')).toEqual(
      new Map([
        [12, '/usr/bin/node /x/broker.js --socket /s'],
        [13, 'sh -c true'],
      ]),
    );
  });
});

describe('ancestorsOf', () => {
  it('walks up to launchd and survives a cycle', () => {
    const row = (pid: number, ppid: number) => ({ pid, ppid, pgid: pid, uid: 0, elapsedSeconds: 0, comm: 'x' });
    expect([...ancestorsOf([row(1, 0), row(10, 1), row(20, 10), row(30, 20)], 30)].sort()).toEqual([10, 20, 30]);
    expect([...ancestorsOf([row(5, 6), row(6, 5)], 5)].sort()).toEqual([5, 6]);
  });
});

describe('commMatches', () => {
  it('needs an exact match for a path and a basename prefix for lsof’s short name', () => {
    expect(commMatches('/tmp/evil', '/tmp/evil')).toBe(true);
    expect(commMatches('/tmp/evil2', '/tmp/evil')).toBe(false);
    expect(commMatches('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'Google')).toBe(true);
    expect(commMatches('/usr/bin/curl', 'node')).toBe(false);
    expect(commMatches('/usr/bin/curl', '')).toBe(false);
  });
});
