import { describe, expect, it } from 'vitest';

import { createCommandTracker, type TrackedCommand } from './command-tracker';

const setup = () => {
  const got: TrackedCommand[] = [];
  return { got, t: createCommandTracker((c) => got.push(c)) };
};

describe('command tracker', () => {
  it('reports a typed line at Enter by heuristic, handling backspace and escapes', () => {
    const { got, t } = setup();
    t.input('s', 'lss\x7f -la\x1b[D\r');
    expect(got).toEqual([{ sessionId: 's', command: 'ls -la', source: 'heuristic' }]);
  });

  it('does not report a password typed at a password prompt', () => {
    const { got, t } = setup();
    t.output('s', 'Password: ');
    t.input('s', 'hunter2\r');
    expect(got).toEqual([]);
  });

  it('holds a line until OSC 133;C when the shell emits marks', () => {
    const { got, t } = setup();
    t.output('s', '\x1b]133;A\x07$ \x1b]133;B\x07');
    t.input('s', 'git status\r');
    expect(got).toEqual([]);
    t.output('s', '\x1b]133;C\x07');
    expect(got).toEqual([{ sessionId: 's', command: 'git status', source: 'osc-133' }]);
  });

  it('drops a held line when a prompt mark arrives first (text typed at a program prompt)', () => {
    const { got, t } = setup();
    t.output('s', '\x1b]133;A\x07');
    t.input('s', 'secretpw\r');
    t.output('s', '\x1b]133;D;0\x07\x1b]133;A\x07');
    t.output('s', '\x1b]133;C\x07');
    expect(got).toEqual([]);
  });

  it('uses OSC 633;E text verbatim, across a chunk split', () => {
    const { got, t } = setup();
    t.output('s', 'x\x1b]633;E;echo\\x20hi');
    t.output('s', '\x07');
    expect(got).toEqual([{ sessionId: 's', command: 'echo hi', source: 'osc-633' }]);
  });
});
