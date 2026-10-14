import { access, constants, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { stubIdentity } from './layout';
import { readPlistString } from './plist-stamp';
import { execFileIo, planStub, readRuntimeFrameworks, runStubPlan, runtimeFromExecPath, verifyStub, type StubStep } from './stub';
import { fakeIo, fakePayload, fakeRuntime } from './testing';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'launcher-stub-test-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const cleaner = stubIdentity('cleaner', 'Cleaner');

async function plan(stubPath = join(root, 'stubs', 'Midnite Cleaner.app')): Promise<{ steps: StubStep[]; stubPath: string; bundle: string }> {
  const runtime = await fakeRuntime(join(root, 'runtime'));
  const bundle = await fakePayload(join(root, 'bundles', 'cleaner'), '0.2.0');
  const steps = planStub({
    runtime,
    frameworks: await readRuntimeFrameworks(runtime),
    identity: cleaner,
    bundlePath: bundle,
    version: '0.2.0',
    stubPath,
  });
  return { steps, stubPath, bundle };
}

/** Every path a step writes. */
const written = (steps: StubStep[]): string[] =>
  steps.flatMap((s) => (s.kind === 'mkdir' ? [s.path] : s.kind === 'exec' ? [] : [s.to]));

describe('stubIdentity', () => {
  it('wears the suite prefix and a bundle id beside Studio’s and the launcher’s', () => {
    expect(cleaner).toEqual({
      id: 'cleaner',
      displayName: 'Midnite Cleaner',
      bundleId: 'io.bilo.midnite-cleaner',
      executable: 'Midnite Cleaner',
    });
  });
});

describe('planStub', () => {
  it('writes only inside the stub it is building', async () => {
    const { steps, stubPath } = await plan();
    for (const path of written(steps)) expect(path.startsWith(`${stubPath}/`)).toBe(true);
  });

  it('clones (never symlinks) the runtime framework, binary and bundle, then ad-hoc signs and strictly verifies', async () => {
    const { steps, stubPath, bundle } = await plan();
    const clones = steps.filter((s) => s.kind === 'clone');
    expect(clones.map((s) => s.to.slice(stubPath.length))).toEqual(
      expect.arrayContaining([
        '/Contents/Frameworks/Electron Framework.framework',
        '/Contents/Frameworks/Squirrel.framework',
        '/Contents/MacOS/Midnite Cleaner',
        '/Contents/Resources/app.icns',
        '/Contents/Resources/app',
      ]),
    );
    expect(clones.find((s) => s.to.endsWith('/Resources/app'))).toMatchObject({ from: bundle, dir: true });
    const execs = steps.filter((s) => s.kind === 'exec').map((s) => [s.cmd, ...s.args]);
    expect(execs).toEqual([
      ['codesign', '--force', '--deep', '--sign', '-', stubPath],
      ['codesign', '--verify', '--deep', '--strict', stubPath],
    ]);
    // Signing comes last: anything written after it would break the seal.
    expect(steps.at(-1)).toMatchObject({ kind: 'exec', args: expect.arrayContaining(['--verify']) });
  });

  it("renames the runtime's helper apps to the stub's name, so Electron finds them", async () => {
    const { steps, stubPath } = await plan();
    const fw = join(stubPath, 'Contents', 'Frameworks');
    expect(steps).toContainEqual(
      expect.objectContaining({ kind: 'clone', to: join(fw, 'Midnite Cleaner Helper (Renderer).app') }),
    );
    expect(steps).toContainEqual({
      kind: 'rename',
      from: join(fw, 'Midnite Cleaner Helper (Renderer).app', 'Contents', 'MacOS', 'Midnite Apps Helper (Renderer)'),
      to: join(fw, 'Midnite Cleaner Helper (Renderer).app', 'Contents', 'MacOS', 'Midnite Cleaner Helper (Renderer)'),
    });
    expect(steps).toContainEqual(
      expect.objectContaining({
        kind: 'plist',
        to: join(fw, 'Midnite Cleaner Helper (Renderer).app', 'Contents', 'Info.plist'),
        set: expect.objectContaining({ CFBundleExecutable: 'Midnite Cleaner Helper (Renderer)', CFBundleIdentifier: 'io.bilo.midnite-cleaner.helper.Renderer' }),
      }),
    );
    expect(written(steps).some((p) => p.includes('Midnite Apps Helper'))).toBe(false);
  });
});

describe('runStubPlan (fake io)', () => {
  it('builds a stub with its own identity, no launcher protocol and no asar integrity', async () => {
    const { steps, stubPath } = await plan();
    const io = fakeIo();
    await runStubPlan(steps, io);
    expect(await verifyStub(stubPath, cleaner)).toBeNull();

    const info = await readFile(join(stubPath, 'Contents', 'Info.plist'), 'utf8');
    expect(readPlistString(info, 'CFBundleIdentifier')).toBe('io.bilo.midnite-cleaner');
    expect(readPlistString(info, 'CFBundleName')).toBe('Midnite Cleaner');
    expect(readPlistString(info, 'CFBundleExecutable')).toBe('Midnite Cleaner');
    expect(readPlistString(info, 'CFBundleIconFile')).toBe('app.icns');
    expect(readPlistString(info, 'CFBundleShortVersionString')).toBe('0.2.0');
    expect(info).not.toContain('ElectronAsarIntegrity');
    expect(info).not.toContain('<string>midnite</string>');

    const helper = join(stubPath, 'Contents', 'Frameworks', 'Midnite Cleaner Helper (GPU).app', 'Contents');
    await access(join(helper, 'MacOS', 'Midnite Cleaner Helper (GPU)'), constants.X_OK);
    expect(readPlistString(await readFile(join(helper, 'Info.plist'), 'utf8'), 'CFBundleName')).toBe('Midnite Cleaner Helper (GPU)');

    expect(io.calls.filter((c) => c[0] === 'cp').every((c) => c[1] === '-c' || c[1] === '-cR')).toBe(true);
  });

  it('stops at the first failing step', async () => {
    const { steps, stubPath } = await plan();
    const io = fakeIo((cmd, args) => cmd === 'codesign' && args.includes('--verify'));
    await expect(runStubPlan(steps, io)).rejects.toThrow(/codesign failed/);
    // Built but never verified: the installer's own verifyStub + swap decide what happens next.
    expect((await stat(stubPath)).isDirectory()).toBe(true);
  });
});

describe('runtimeFromExecPath', () => {
  it('finds the .app around a packaged executable, and nothing in dev', () => {
    expect(runtimeFromExecPath('/Applications/Midnite Apps.app/Contents/MacOS/Midnite Apps', '0.3.0')).toEqual({
      appPath: '/Applications/Midnite Apps.app',
      executable: 'Midnite Apps',
      version: '0.3.0',
    });
    expect(runtimeFromExecPath('/usr/local/bin/node', '0.3.0')).toBeNull();
  });
});

// The real clonefile(2), on a few bytes in a temp dir: proves the `cp -c` argv is what macOS
// accepts. codesign is still faked — signing a fake bundle proves nothing about a real one, so
// that stays the PR's manual check.
describe.runIf(process.platform === 'darwin')('runStubPlan (real cp -c, temp dir only)', () => {
  it('clones the runtime into a stub', async () => {
    const { steps, stubPath } = await plan();
    const real = execFileIo();
    const calls: string[] = [];
    await runStubPlan(steps, {
      exec: async (cmd, args) => {
        calls.push(cmd);
        if (cmd === 'codesign') return;
        await real.exec(cmd, args);
      },
    });
    expect(calls).toContain('cp');
    expect(await verifyStub(stubPath, cleaner)).toBeNull();
    expect(await readFile(join(stubPath, 'Contents', 'Resources', 'app', 'main.js'), 'utf8')).toContain('cleaner 0.2.0');
  });
});
