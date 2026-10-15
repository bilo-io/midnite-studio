/* eslint-disable no-console -- a proof prints what it observed */
// Opt-in end-to-end proof (Phase 113 Theme H2), darwin only: builds Cleaner, packs the zip the way a
// release does (scripts/pack-bundle.mjs), installs it with the launcher's real installAppBundle into TEMP
// roots, checks the stub, runs Cleaner's main headlessly once, then uninstalls. Never touches
// /Applications, a real userData or the screen. `MIDNITE_CLEANER_PROOF=1 pnpm vitest run <this file>`.
// Why not default: it runs a vite build and an Electron process; the gate must stay fast.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { installAppBundle, uninstallAppBundle } from './install-bundle';
import { stubIdentity, stubPathFor } from './layout';
import { readPlistString } from './plist-stamp';
import { readRuntimeFrameworks, verifyStub, type RuntimeApp } from './stub';

const repo = fileURLToPath(new URL('../../../../../', import.meta.url));
const electronApp = join(repo, 'apps/launcher/node_modules/electron/dist/Electron.app');
const on = process.platform === 'darwin' && process.env.MIDNITE_CLEANER_PROOF === '1' && existsSync(electronApp);

describe.skipIf(!on)('Cleaner installs, runs headlessly and uninstalls (darwin, temp roots)', () => {
  const work = mkdtempSync(join(tmpdir(), 'cleaner-proof-'));
  afterAll(() => rmSync(work, { recursive: true, force: true }));
  const identity = stubIdentity('cleaner', 'Cleaner');
  const roots = { installRoot: join(work, 'bundles'), stubRoot: join(work, 'stubs') };
  const version = '0.0.1';
  const runtime: RuntimeApp = { appPath: electronApp, executable: 'Electron', version };

  it('builds, packs, installs, verifies the stub, runs main, uninstalls', async () => {
    execFileSync('pnpm', ['run', 'build'], { cwd: join(repo, 'apps/cleaner'), stdio: 'ignore' });
    const pack = await import(join(repo, 'scripts/pack-bundle.mjs'));
    const zip: string = pack.packBundle({ app: 'cleaner', dir: join(repo, 'apps/cleaner'), version, out: join(work, 'out') });
    const bytes = readFileSync(zip);
    const entry = {
      id: 'cleaner',
      version,
      bundleUrl: 'https://example.invalid/cleaner.zip',
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      minimumRuntimeVersion: version,
    };
    execFileSync('mkdir', ['-p', roots.stubRoot]);

    const installed = await installAppBundle(entry, identity, {
      roots,
      runtime,
      isRunning: async () => false,
      fetchImpl: (async () => new Response(bytes, { status: 200, headers: { 'content-length': String(bytes.length) } })) as typeof fetch,
    });
    expect(installed).toEqual({ ok: true });
    console.log('proof: installed ->', readdirSync(roots.stubRoot), readdirSync(join(roots.installRoot, 'cleaner')));

    const stub = stubPathFor(roots, identity);
    expect(await verifyStub(stub, identity)).toBeNull();
    execFileSync('codesign', ['--verify', '--deep', '--strict', stub]);
    const plist = readFileSync(join(stub, 'Contents/Info.plist'), 'utf8');
    expect(readPlistString(plist, 'CFBundleName')).toBe('Midnite Cleaner');
    expect(readPlistString(plist, 'CFBundleIdentifier')).toBe('io.bilo.midnite-cleaner');
    const helpers = (await readRuntimeFrameworks({ ...runtime, appPath: stub })).filter((f) => f.includes('Helper'));
    expect(helpers.every((h) => h.startsWith('Midnite Cleaner Helper'))).toBe(true);
    const app = join(stub, 'Contents/Resources/app');
    const pkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')) as { main: string };
    expect(pkg.main).toBe('main.cjs');
    expect(existsSync(join(app, 'main.cjs')) && existsSync(join(app, 'preload.cjs')) && existsSync(join(app, 'index.html'))).toBe(true);

    // Headless: no window shown, hidden from the Dock, own throwaway userData, quits on did-finish-load.
    const run = spawnSync(join(stub, 'Contents/MacOS', identity.executable), [], {
      env: { ...process.env, MIDNITE_CLEANER_SMOKE: '1', MIDNITE_CLEANER_USER_DATA: join(work, 'userData') },
      encoding: 'utf8',
      timeout: 60_000,
    });
    console.log('proof: smoke stdout ->', JSON.stringify(run.stdout.trim()), 'status', run.status);
    expect(run.stdout).toContain('midnite-cleaner:ready');

    expect(await uninstallAppBundle(identity, { roots, isRunning: async () => false })).toEqual({ ok: true });
    expect(existsSync(stub)).toBe(false);
    expect(existsSync(join(roots.installRoot, 'cleaner'))).toBe(false);
    console.log('proof: uninstalled ->', readdirSync(roots.stubRoot));
  }, 180_000);
});
