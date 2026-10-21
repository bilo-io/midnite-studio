#!/usr/bin/env node
/**
 * Build the launcher's dev stub: `<out>/Midnite Apps.app`, an APFS clone of the stock
 * Electron.app re-badged with the launcher's name, bundle id and icon, so `launcher:start`
 * shows "Midnite Apps" in the Dock (see src/main/bundles/dev-stub.ts for why).
 *
 *   node --experimental-strip-types scripts/dev-app.mjs [--out <dir>] [--electron <Electron.app>]
 *
 * Prints the stub's executable path on stdout (everything else goes to stderr), and is
 * idempotent: it rebuilds only when Electron's version or the icon changed. The out dir is a
 * parameter (default `apps/launcher/.dev-app`, git-ignored); nothing outside it is written.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEV_STUB_NAME, devStubStamp, planDevStub } from '../src/main/bundles/dev-stub.ts';
import { stampPlist } from '../src/main/bundles/plist-stamp.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const log = (m) => process.stderr.write(`[dev-app] ${m}\n`);

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function devStubExecutable(out) {
  return join(out, `${DEV_STUB_NAME}.app`, 'Contents', 'MacOS', DEV_STUB_NAME);
}

function runStep(step, state) {
  switch (step.kind) {
    case 'clone': {
      mkdirSync(dirname(step.to), { recursive: true });
      const flags = step.dir ? '-cR' : '-c';
      try {
        execFileSync('cp', [flags, step.from, step.to], { stdio: 'pipe' });
      } catch {
        // Not APFS (or another volume): a full copy is ~230 MB but still correct.
        if (!state.warned) log('WARNING: APFS clone failed, falling back to a full copy');
        state.warned = true;
        execFileSync('cp', [step.dir ? '-R' : '-p', step.from, step.to], { stdio: 'pipe' });
      }
      break;
    }
    case 'rename':
      renameSync(step.from, step.to);
      break;
    case 'plist':
      writeFileSync(step.to, stampPlist(readFileSync(step.from, 'utf8'), { set: step.set, remove: step.remove }));
      break;
    case 'exec':
      execFileSync(step.cmd, step.args, { stdio: 'pipe' });
      break;
  }
}

export function buildDevStub({ out, electronApp, icon, electronVersion }) {
  const stubPath = join(out, `${DEV_STUB_NAME}.app`);
  const stampFile = join(out, '.stamp');
  const stamp = devStubStamp(electronVersion, createHash('sha256').update(readFileSync(icon)).digest('hex'));
  if (existsSync(devStubExecutable(out)) && existsSync(stampFile) && readFileSync(stampFile, 'utf8') === stamp) {
    return { stubPath, rebuilt: false };
  }
  rmSync(stubPath, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const frameworks = readdirSync(join(electronApp, 'Contents', 'Frameworks'));
  const state = { warned: false };
  for (const step of planDevStub({ electronApp, frameworks, icon, stubPath })) runStep(step, state);
  writeFileSync(stampFile, stamp);
  return { stubPath, rebuilt: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'darwin') {
    log('not macOS: no dev stub needed');
    process.exit(0);
  }
  const require = createRequire(import.meta.url);
  const electronDir = join(dirname(require.resolve('electron/package.json')));
  const out = resolve(arg('out') ?? join(root, '.dev-app'));
  const result = buildDevStub({
    out,
    electronApp: resolve(arg('electron') ?? join(electronDir, 'dist', 'Electron.app')),
    icon: join(root, 'resources', 'icon.icns'),
    electronVersion: JSON.parse(readFileSync(join(electronDir, 'package.json'), 'utf8')).version,
  });
  log(result.rebuilt ? `built ${result.stubPath}` : 'up to date');
  process.stdout.write(`${devStubExecutable(out)}\n`);
}
