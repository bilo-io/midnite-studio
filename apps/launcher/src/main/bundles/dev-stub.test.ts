import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { DEV_STUB_BUNDLE_ID, DEV_STUB_NAME, devStubStamp, planDevStub } from './dev-stub';
import { readPlistString } from './plist-stamp';

const input = {
  electronApp: '/x/Electron.app',
  frameworks: ['Electron Framework.framework', 'Electron Helper (GPU).app', 'Electron Helper.app', 'Mantle.framework'],
  icon: '/r/icon.icns',
  stubPath: '/out/Midnite Apps.app',
};

describe('planDevStub', () => {
  const steps = planDevStub(input);

  it('clones the whole Electron.app first and signs last', () => {
    expect(steps[0]).toEqual({ kind: 'clone', from: '/x/Electron.app', to: '/out/Midnite Apps.app', dir: true });
    expect(steps.at(-2)).toMatchObject({ kind: 'exec', cmd: 'codesign', args: expect.arrayContaining(['--sign', '-']) });
    expect(steps.at(-1)).toMatchObject({ kind: 'exec', args: expect.arrayContaining(['--verify']) });
  });

  it('renames each helper, its executable, and gives it a dev-scoped id', () => {
    const gpu = steps.filter((s) => s.kind === 'plist' && s.set.CFBundleName === 'Midnite Apps Helper (GPU)');
    expect(gpu).toHaveLength(1);
    expect(gpu[0]).toMatchObject({ set: { CFBundleIdentifier: `${DEV_STUB_BUNDLE_ID}.helper.GPU` } });
    expect(steps).toContainEqual({
      kind: 'rename',
      from: '/out/Midnite Apps.app/Contents/Frameworks/Electron Helper.app',
      to: '/out/Midnite Apps.app/Contents/Frameworks/Midnite Apps Helper.app',
    });
    expect(steps.some((s) => s.kind === 'clone' && s.to.includes('Mantle'))).toBe(false);
  });

  it('stamps name, dev bundle id and icon, distinct from production', () => {
    const main = steps.find((s) => s.kind === 'plist' && s.to === '/out/Midnite Apps.app/Contents/Info.plist');
    expect(main).toMatchObject({
      set: { CFBundleName: DEV_STUB_NAME, CFBundleDisplayName: DEV_STUB_NAME, CFBundleIconFile: 'app.icns' },
    });
    expect(DEV_STUB_BUNDLE_ID).not.toBe('io.bilo.midnite-launcher');
    expect(DEV_STUB_BUNDLE_ID).toMatch(/^io\.bilo\.midnite-launcher\.dev$/);
  });

  it('stamps only change when Electron or the icon does', () => {
    expect(devStubStamp('33.2.0', 'a')).toBe(devStubStamp('33.2.0', 'a'));
    expect(devStubStamp('33.2.0', 'a')).not.toBe(devStubStamp('33.3.0', 'a'));
    expect(devStubStamp('33.2.0', 'a')).not.toBe(devStubStamp('33.2.0', 'b'));
  });
});

// Needs macOS: real `cp -c` clone, `codesign` and `plutil`-shaped plist.
describe.skipIf(process.platform !== 'darwin')('dev-app.mjs (darwin)', () => {
  const out = mkdtempSync(join(tmpdir(), 'dev-app-'));
  afterAll(() => rmSync(out, { recursive: true, force: true }));
  const script = fileURLToPath(new URL('../../../scripts/dev-app.mjs', import.meta.url));
  const run = (): string =>
    execFileSync(process.execPath, ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', script, '--out', out], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();

  it('builds a signed stub with the launcher identity, then reuses it', () => {
    const exe = run();
    expect(exe).toBe(join(out, 'Midnite Apps.app', 'Contents', 'MacOS', 'Midnite Apps'));
    expect(statSync(exe).isFile()).toBe(true);
    const plist = readFileSync(join(out, 'Midnite Apps.app', 'Contents', 'Info.plist'), 'utf8');
    expect(readPlistString(plist, 'CFBundleName')).toBe('Midnite Apps');
    expect(readPlistString(plist, 'CFBundleIdentifier')).toBe(DEV_STUB_BUNDLE_ID);
    expect(readPlistString(plist, 'CFBundleExecutable')).toBe('Midnite Apps');
    execFileSync('codesign', ['--verify', '--deep', '--strict', join(out, 'Midnite Apps.app')]);
    const before = statSync(join(out, '.stamp')).mtimeMs;
    expect(run()).toBe(exe);
    expect(statSync(join(out, '.stamp')).mtimeMs).toBe(before);
  }, 120_000);
});
