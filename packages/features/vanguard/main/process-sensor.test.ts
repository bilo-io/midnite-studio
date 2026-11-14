import { DEFAULT_VANGUARD_SETTINGS, type NewSecurityFinding } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { CODESIGN_UNSIGNED, HOME } from './__fixtures__/sensor-fixtures';
import { createProcessSensor } from './process-sensor';
import type { SensorContext, SensorRunProcess } from './sensor-host';

const ps = (extra = ''): string => `PID PPID UID COMM ARGS
  400     1   501 /bin/zsh -zsh
  700   400   501 /opt/homebrew/bin/node node a.js
${extra}`;

function harness(table: () => string) {
  const recorded: NewSecurityFinding[] = [];
  const run: SensorRunProcess = async (cmd) => {
    if (cmd === 'ps') return { ok: true, stdout: table(), stderr: '', exitCode: 0 };
    if (cmd === 'codesign') return { ok: true, stdout: '', stderr: CODESIGN_UNSIGNED, exitCode: 1 };
    if (cmd === 'spctl') return { ok: true, stdout: '', stderr: 'rejected', exitCode: 3 };
    return { ok: true, stdout: '0081;1;x;', stderr: '', exitCode: 0 }; // xattr: quarantined
  };
  const ctx: SensorContext = {
    userData: '/u',
    homeDir: HOME,
    now: () => 1,
    runProcess: run,
    record: async (f) => {
      recorded.push({ ...f, source: 'vanguard' });
      return {} as never;
    },
    settings: () => DEFAULT_VANGUARD_SETTINGS,
    signal: new AbortController().signal,
    log: () => undefined,
  };
  return { recorded, ctx };
}

describe('process sensor', () => {
  it('seeds silently, then flags a new unsigned quarantined binary under an agent shell as critical', async () => {
    let table = ps();
    const { recorded, ctx } = harness(() => table);
    const store = new Map<string, string[]>();
    const sensor = createProcessSensor({
      fullDiskAccess: () => true,
      agentSessions: () => new Map([[400, 'sess-1']]),
      load: async (f) => store.get(f) ?? null,
      save: async (f, p) => void store.set(f, p),
    });
    await sensor.start!(ctx);
    expect(await sensor.run!(ctx)).toEqual({ findings: 0 });

    table = ps('  900   400   501 /Users/dev/Downloads/payload /Users/dev/Downloads/payload -x\n');
    expect(await sensor.run!(ctx)).toEqual({ findings: 1 });
    expect(recorded[0]).toMatchObject({
      category: 'process',
      severity: 'critical',
      sessionId: 'sess-1',
      fingerprint: 'process:/Users/dev/Downloads/payload',
    });
    expect(recorded[0]!.remediation.map((r) => r.id)).toEqual([
      'kill-process-group',
      'pause-session',
      'quarantine-file',
      'mute',
    ]);
    // Seen now; the next pass is quiet, and the known set was persisted.
    expect(await sensor.run!(ctx)).toEqual({ findings: 0 });
    expect([...store.values()][0]).toContain('/Users/dev/Downloads/payload');
  });

  it('a ps that cannot run is an error the host reports', async () => {
    const { ctx } = harness(() => '');
    const sensor = createProcessSensor({ load: async () => null, save: async () => undefined });
    const failing: SensorContext = {
      ...ctx,
      runProcess: async () => ({ ok: false, reason: 'timed-out', hint: 'slow' }),
    };
    await expect(sensor.run!(failing)).rejects.toThrow(/ps failed/);
  });

  it('does not open a binary under a protected folder without Full Disk Access, and says it is unverified', async () => {
    let table = ps();
    const calls: string[] = [];
    const base = harness(() => table);
    const ctx: SensorContext = {
      ...base.ctx,
      runProcess: async (cmd, ...rest) => {
        calls.push(cmd);
        return base.ctx.runProcess(cmd, ...rest);
      },
    };
    const store = new Map<string, string[]>();
    const sensor = createProcessSensor({
      load: async (f) => store.get(f) ?? null,
      save: async (f, p) => void store.set(f, p),
    });
    await sensor.start!(ctx);
    await sensor.run!(ctx);
    table = ps('  900   400   501 /Users/dev/Downloads/payload /Users/dev/Downloads/payload -x\n');
    expect(await sensor.run!(ctx)).toEqual({ findings: 1 });
    expect(calls.filter((c) => c !== 'ps')).toEqual([]);
    const f = base.recorded[0]!;
    expect(f).toMatchObject({ severity: 'info', fingerprint: 'process:/Users/dev/Downloads/payload' });
    expect(f.detail).toContain('unverified (protected folder)');
    // no path evidence, so the malware queue is never fed this file
    expect(f.evidence.some((e) => e.kind === 'path')).toBe(false);
  });

  it('inspects a protected-folder binary as before when Full Disk Access is granted', async () => {
    let table = ps();
    const { recorded, ctx } = harness(() => table);
    const store = new Map<string, string[]>();
    const sensor = createProcessSensor({
      fullDiskAccess: () => true,
      load: async (f) => store.get(f) ?? null,
      save: async (f, p) => void store.set(f, p),
    });
    await sensor.start!(ctx);
    await sensor.run!(ctx);
    table = ps('  900   400   501 /Users/dev/Downloads/payload /Users/dev/Downloads/payload -x\n');
    await sensor.run!(ctx);
    expect(recorded[0]!.evidence.some((e) => e.kind === 'path')).toBe(true);
  });
});
