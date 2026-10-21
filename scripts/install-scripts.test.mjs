// The two curl-pipe installers this repo carries: the launcher's (`apps/launcher/install.sh`,
// published by release.yml) and Studio's (`packages/website/public/install-studio.sh`, a mirror of
// midnite-apps' `midnite-studio/install.sh`). Neither can run here — both write /Applications — so
// the two guard snippets that broke v0.0.3 installs are cut out and run under `sh` with the tools
// they call stubbed. midnite-apps' `install-smoke.yml` is the end-to-end half: it installs the live
// release on a macOS runner.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALLERS = ['apps/launcher/install.sh', 'packages/website/public/install-studio.sh'];

describe.each(INSTALLERS)('%s', (file) => {
  const script = readFileSync(path.join(root, file), 'utf8');

  it('parses as POSIX sh', () => {
    expect(spawnSync('sh', ['-n', path.join(root, file)]).status).toBe(0);
  });

  // Every release is ad hoc signed until notarisation lands, and Gatekeeper rejects all of them; a
  // refusal there turned away every install of v0.0.3.
  it('installs a build Gatekeeper rejects, with a warning', () => {
    const block = /^gatekeeper_ok=1\n[\s\S]*?^fi$/m.exec(script)?.[0];
    expect(block).toBeDefined();
    const run = spawnSync('sh', [
      '-c',
      `set -eu; spctl() { return 3; }; say() { printf '%s\\n' "$*"; }; fail() { exit 1; }; tmp=/tmp; APP=x\n${block}\nprintf 'gatekeeper_ok=%s' "$gatekeeper_ok"`,
    ]);
    expect(run.status).toBe(0);
    expect(run.stdout.toString()).toContain('gatekeeper_ok=0');
    expect(run.stderr.toString()).toContain('warning: Gatekeeper rejects this build');
  });

  it('still refuses a broken code signature', () => {
    expect(script).toMatch(
      /codesign --verify --deep --strict "\$tmp\/extracted\/\$APP"[^\n]*\|\| \{\n[^\n]*\n\s*fail "the app's code signature is invalid/,
    );
  });

  // Under `set -e` the EXIT trap's last command becomes the script's status; a `[ -e … ] &&` there
  // made every successful install exit 1.
  it('exits 0 when the cleanup trap has nothing staged to remove', () => {
    const cleanup = /^cleanup\(\) \{\n[\s\S]*?^\}$/m.exec(script)?.[0];
    expect(cleanup).toBeDefined();
    const run = spawnSync('sh', [
      '-c',
      `set -eu; tmp=$(mktemp -d); staged=/nonexistent-midnite-staged\n${cleanup}\ntrap cleanup EXIT; true`,
    ]);
    expect(run.status).toBe(0);
  });
});
