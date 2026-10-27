import { describe, expect, it } from 'vitest';

import { parsePs, subtreeOf } from './processes';

const PS = [
  '    1     0 /sbin/launchd',
  '  100     1 /Applications/Midnite Studio.app/Contents/MacOS/Midnite Studio broker.js',
  '  200   100 -zsh',
  '  201   200 claude --resume',
  '  202   201 node /usr/local/bin/some-tool --flag',
  '  300     1 /usr/bin/ssh host',
  'garbage line',
  '',
].join('\n');

describe('parsePs', () => {
  it('keeps pid, ppid and the whole argument string', () => {
    const rows = parsePs(PS);
    expect(rows).toHaveLength(6);
    expect(rows[1]).toEqual({ pid: 100, ppid: 1, args: '/Applications/Midnite Studio.app/Contents/MacOS/Midnite Studio broker.js' });
  });
});

describe('subtreeOf', () => {
  it('is the root and everything below it, and nothing beside it', () => {
    const rows = parsePs(PS);
    expect([...subtreeOf(rows, 200)].sort()).toEqual([200, 201, 202]);
    expect([...subtreeOf(rows, 300)]).toEqual([300]);
  });

  it('survives a process that is its own parent', () => {
    expect([...subtreeOf([{ pid: 5, ppid: 5, args: 'x' }], 5)]).toEqual([5]);
  });
});
