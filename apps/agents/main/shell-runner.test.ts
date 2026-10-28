// @vitest-environment node
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { createShellRunner } from './shell-runner';

/** Runs `typed` in a real `/bin/sh` and collects its output — the one process these tests start, and never an agent CLI. */
async function run(typed: string, listenLate = false) {
  const runner = createShellRunner({ shell: '/bin/sh' });
  const created = await runner.createPty({ sessionId: 's', cwd: process.cwd(), cols: 80, rows: 24, initialInput: `${typed}\r` });
  if (!created.ok) throw new Error(created.message);
  if (listenLate) await new Promise((resolve) => setTimeout(resolve, 150));
  return new Promise<{ out: string; code: number }>((resolve) => {
    const chunks: Uint8Array[] = [];
    runner.onPty(
      created.ptyId,
      (bytes) => chunks.push(bytes),
      (code) => resolve({ out: Buffer.concat(chunks).toString('utf8'), code }),
    );
  });
}

describe('createShellRunner', () => {
  it('runs the typed command, streams its output and reports the CLI exit code', async () => {
    const { out, code } = await run('echo council-member; exit 3');
    expect(out).toContain('council-member');
    expect(code).toBe(3);
  });

  it('loses nothing a fast member prints before the runner has registered its listener', async () => {
    const { out, code } = await run('echo early; exit 0', true);
    expect(out).toContain('early');
    expect(code).toBe(0);
  });

  it('kills a member that never ends', async () => {
    const runner = createShellRunner({ shell: '/bin/sh' });
    const created = await runner.createPty({ sessionId: 's', cwd: process.cwd(), cols: 80, rows: 24, initialInput: 'sleep 30\r' });
    if (!created.ok) throw new Error(created.message);
    const exited = new Promise<number>((resolve) => runner.onPty(created.ptyId, () => undefined, resolve));
    runner.killPty(created.ptyId);
    expect(await exited).not.toBe(0);
  });

  it('kills the whole member — the command the shell started, not just the shell', async () => {
    const runner = createShellRunner({ shell: '/bin/sh' });
    const created = await runner.createPty({
      sessionId: 's',
      cwd: process.cwd(),
      cols: 80,
      rows: 24,
      initialInput: 'sleep 30 & echo "pid:$!"; wait\r',
    });
    if (!created.ok) throw new Error(created.message);
    let out = '';
    const exited = new Promise<number>((resolve) =>
      runner.onPty(created.ptyId, (bytes) => (out += Buffer.from(bytes).toString('utf8')), resolve),
    );
    while (!/pid:\d+/.test(out)) await new Promise((resolve) => setTimeout(resolve, 20));
    const pid = Number(/pid:(\d+)/.exec(out)?.[1]);
    runner.killPty(created.ptyId);
    await exited;
    // A SIGKILLed orphan lingers as a zombie until launchd reaps it, and `kill(pid, 0)` succeeds on a zombie — so poll.
    const alive = () => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    for (let i = 0; i < 100 && alive(); i++) await new Promise((resolve) => setTimeout(resolve, 20));
    expect(alive()).toBe(false);
  });

  it('killAll ends every member still running', async () => {
    const runner = createShellRunner({ shell: '/bin/sh' });
    const exits = await Promise.all(
      ['a', 'b'].map(async (sessionId) => {
        const created = await runner.createPty({ sessionId, cwd: process.cwd(), cols: 80, rows: 24, initialInput: 'sleep 30\r' });
        if (!created.ok) throw new Error(created.message);
        // Wrapped, so the outer Promise.all waits for the members to start, not to end.
        return { exited: new Promise<number>((resolve) => runner.onPty(created.ptyId, () => undefined, resolve)) };
      }),
    );
    runner.killAll();
    expect(await Promise.all(exits.map((m) => m.exited))).not.toContain(0);
  });
});

// Real sandbox-exec: macOS only (it runs in gate-native), skipped elsewhere because Seatbelt does not exist there.
describe.skipIf(process.platform !== 'darwin')('createShellRunner confinement (sandbox-exec, macOS)', () => {
  it('runs the member under the profile and releases it once the shell has exited', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'shell-confine-')));
    const profile = join(dir, 'p.sb');
    const target = join(dir, 'target.txt');
    writeFileSync(profile, `(version 1)\n(allow default)\n(deny file-write* (literal "${target}"))\n`);
    const release = vi.fn();
    const runner = createShellRunner({ shell: '/bin/sh', confine: async () => ({ profile, release }) });
    const created = await runner.createPty({ sessionId: 's', cwd: dir, cols: 80, rows: 24, initialInput: `echo hi > ${target}; exit $?\r` });
    if (!created.ok) throw new Error(created.message);
    const code = await new Promise<number>((resolve) => runner.onPty(created.ptyId, () => undefined, resolve));
    expect(code).not.toBe(0);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
