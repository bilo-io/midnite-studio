// verify-signature: refuse to publish a zip whose app install.sh would refuse.
//
//   node scripts/verify-signature.mjs <zip> [<zip> …]
//
// Each zip is extracted with `ditto -xk` and its top-level `.app` checked with
// `codesign --verify --deep --strict` — the same two steps, in the same order, that the
// installers (`apps/launcher/install.sh`, midnite-apps' `midnite-studio/install.sh`) take
// before they install anything. The launcher shipped every release up to v0.0.3 with no
// sealed resources, its own installer refused it, and nothing in the release noticed. This
// is the check that would have.
//
// Gatekeeper (`spctl`) is not asked: every build is ad hoc signed until notarisation lands,
// and Gatekeeper rejects all of them; the installers warn about that rather than refuse.
// `packages/desktop/scripts/verify-dist.mjs` asserts spctl for a Developer ID build.
//
// macOS only (ditto, codesign). No dependencies, so it runs from a bare checkout.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const zips = process.argv.slice(2);
if (zips.length === 0) {
  console.error('verify-signature: pass one or more .zip paths.');
  process.exit(2);
}
if (process.platform !== 'darwin') {
  console.error('verify-signature: needs macOS (ditto, codesign).');
  process.exit(2);
}

let failed = 0;
for (const zip of zips) {
  const dir = mkdtempSync(path.join(tmpdir(), 'verify-signature-'));
  try {
    execFileSync('ditto', ['-xk', zip, dir]);
    const apps = readdirSync(dir).filter((name) => name.endsWith('.app'));
    if (apps.length !== 1) {
      console.error(`✗ ${zip}: expected one top-level .app, found ${apps.length}`);
      failed += 1;
      continue;
    }
    execFileSync('codesign', ['--verify', '--deep', '--strict', path.join(dir, apps[0])], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    console.log(`✓ ${zip}: ${apps[0]} passes codesign --verify --deep --strict`);
  } catch (error) {
    console.error(`✗ ${zip}: ${error instanceof Error ? error.message : String(error)}`);
    failed += 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
process.exit(failed === 0 ? 0 : 1);
