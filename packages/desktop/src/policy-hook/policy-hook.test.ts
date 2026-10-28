import { Readable, Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import { runPolicyHook, POLICY_EVALUATE_TOOL } from './index';

function createMockIO(input = '') {
  let stdoutData = '';
  let stderrData = '';
  const stdin = Readable.from([input]);
  const stdout = new Writable({
    write(chunk, _encoding, callback) {
      stdoutData += chunk.toString();
      callback();
    },
  });
  const stderr = new Writable({
    write(chunk, _encoding, callback) {
      stderrData += chunk.toString();
      callback();
    },
  });

  return {
    io: { stdin, stdout, stderr },
    getStdout: () => stdoutData,
    getStderr: () => stderrData,
  };
}

describe('policy hook', () => {
  it('allows and exits 0 when the policy permits the tool call', async () => {
    const mock = createMockIO(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' } }));
    const caller = vi.fn(async (tool: string, input: unknown) => {
      expect(tool).toBe(POLICY_EVALUATE_TOOL);
      expect(input).toEqual({ tool_name: 'Bash', tool_input: { command: 'ls' } });
      return { id: '1', ok: true as const, value: { decision: 'allow', reason: 'allowed' } };
    });

    const code = await runPolicyHook(mock.io, caller as never);
    expect(code).toBe(0);
    expect(mock.getStdout()).toContain('"decision":"allow"');
    expect(mock.getStderr()).toBe('');
  });

  it('denies and exits 2 when the policy refuses the tool call', async () => {
    const mock = createMockIO(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git reset --hard' } }));
    const caller = vi.fn(async () => ({
      id: '2',
      ok: true as const,
      value: { decision: 'deny', reason: 'Destructive git reset' },
    }));

    const code = await runPolicyHook(mock.io, caller as never);
    expect(code).toBe(2);
    expect(mock.getStdout()).toContain('"decision":"deny"');
    expect(mock.getStdout()).toContain('Destructive git reset');
    expect(mock.getStderr()).toContain('Denied by policy: Destructive git reset');
  });

  it('with the app closed, allows and logs to stderr (exits 0)', async () => {
    const mock = createMockIO(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'npm test' } }));
    const caller = vi.fn(async () => ({
      id: '3',
      ok: false as const,
      kind: 'error' as const,
      message: 'Midnite Studio is not running, or its MCP server is off.',
    }));

    const code = await runPolicyHook(mock.io, caller as never);
    expect(code).toBe(0);
    expect(mock.getStderr()).toContain('Midnite Studio is not running');
    expect(mock.getStderr()).toContain('allowing tool call');
  });

  it('survives empty stdin and malformed json', async () => {
    const mock = createMockIO('not json');
    const caller = vi.fn(async () => ({
      id: '4',
      ok: true as const,
      value: { decision: 'allow', reason: 'allowed' },
    }));

    const code = await runPolicyHook(mock.io, caller as never);
    expect(code).toBe(0);
    expect(caller).toHaveBeenCalledWith(POLICY_EVALUATE_TOOL, { raw: 'not json' });
  });
});
