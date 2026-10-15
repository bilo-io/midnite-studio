// Phase 113 Theme F1 — what a tag-push release builds, and that it stays inside the macOS cap.
// Plain vitest/node: reads release.yml and ci.yml as text, no browser needed.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { allApps, bundleMatrix } from './release-bundles.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(repoRoot, f), 'utf8');

/** Count job-level `runs-on: macos-*` lines. */
const macosJobs = (yml) => (yml.match(/^\s{4}runs-on:\s*macos-/gm) ?? []).length;
/** The text of one top-level job (from `  <id>:` to the next job). */
function job(yml, id) {
  const start = yml.search(new RegExp(`^  ${id}:$`, 'm'));
  expect(start, `job ${id}`).toBeGreaterThanOrEqual(0);
  const rest = yml.slice(start + 1);
  const next = rest.search(/^  [a-z][a-z0-9-]*:$/m);
  return next < 0 ? rest : rest.slice(0, next);
}

describe('bundleMatrix', () => {
  const has = (dir) => ['apps/browser', 'apps/studio', 'apps/launcher'].includes(dir);
  it('keeps affected apps that have a project of their own', () => {
    expect(bundleMatrix(['cleaner', 'browser'], has)).toEqual({
      include: [{ app: 'browser', project: 'app-browser', dir: 'apps/browser' }],
    });
  });
  it('never makes a bundle of studio or the launcher', () => {
    expect(bundleMatrix(['studio', 'launcher'], has).include).toEqual([]);
  });
  it('is empty when nothing is affected', () => {
    expect(bundleMatrix([], has).include).toEqual([]);
  });
  it('lists every extracted app for a release (lockstep), sorted', () => {
    expect(allApps(['studio', 'launcher', 'browser', 'cleaner'], has)).toEqual(['browser', 'launcher', 'studio']);
    expect(bundleMatrix(allApps(['studio', 'browser'], has), has).include.map((e) => e.app)).toEqual(['browser']);
  });
});

describe('the real apps/ tree (Theme H1)', () => {
  const has = (dir) => existsSync(path.join(repoRoot, dir, 'moon.yml'));
  const apps = allApps(readdirSync(path.join(repoRoot, 'apps')), has);
  it('puts cleaner in the --all matrix, as app-cleaner', () => {
    expect(apps).toContain('cleaner');
    expect(bundleMatrix(apps, has).include).toContainEqual({ app: 'cleaner', project: 'app-cleaner', dir: 'apps/cleaner' });
  });
  it('gives cleaner the icon a release needs to pack it (an app without one is skipped)', () => {
    const icns = readFileSync(path.join(repoRoot, 'apps/cleaner/resources/icon.icns'));
    expect(icns.subarray(0, 4).toString('ascii')).toBe('icns');
  });
  it('stamps cleaner at the lockstep version', () => {
    const version = (f) => JSON.parse(read(f)).version;
    expect(version('apps/cleaner/package.json').split('.').slice(0, 2)).toEqual(version('package.json').split('.').slice(0, 2));
  });
});

describe('release.yml', () => {
  const release = read('.github/workflows/release.yml');
  it('builds Studio and the launcher in one macOS job', () => {
    const build = job(release, 'build');
    expect(build).toContain('moon run desktop:dist');
    expect(build).toContain('moon run launcher:dist');
    expect(build).toContain('apps/launcher/release/latest-mac.yml');
    expect(build).toContain('name: launcher-mac-arm64');
  });
  it('publishes only the Studio artifact', () => {
    expect(job(release, 'release')).toMatch(/download-artifact@v\d+\s+with:\s+name: mac-arm64/);
  });
  it('builds every extracted bundle (lockstep), packs the installable zip, off macOS', () => {
    expect(job(release, 'plan')).toContain('release-bundles.mjs --all');
    const bundles = job(release, 'bundles');
    expect(bundles).toContain('fromJSON(needs.plan.outputs.matrix)');
    expect(bundles).toContain('no-quick-kiss.mjs');
    expect(bundles).toContain('icon.icns');
    expect(bundles).toContain('-bundle.zip');
    expect(bundles).not.toMatch(/runs-on:\s*macos-/);
  });
  it('publishes the launcher, bundles and catalog.json only after Studio and its feed', () => {
    const suite = job(release, 'publish-suite');
    expect(suite).toContain('needs: [release, publish-feed, bundles]');
    expect(suite).toContain('tag_name: midnite-launcher/v');
    expect(suite).toContain('name: launcher-mac-arm64');
    expect(suite).toContain('pattern: bundle-*');
    expect(suite).toContain('node scripts/build-catalog.mjs');
    expect(suite).toContain('midnite-launcher/feed/latest-mac.yml');
    expect(suite).toContain('git add catalog.json midnite-launcher/feed/latest-mac.yml');
    expect(suite).not.toMatch(/runs-on:\s*macos-/);
    // The Studio release itself still takes only Studio's artifact.
    expect(job(release, 'release')).not.toContain('launcher-mac-arm64');
  });
  it('uses one macOS job, and CI stays at or under the cap of 5 concurrent', () => {
    expect(macosJobs(release)).toBe(1);
    // ci.yml's count is the baseline this slice did not raise (gate-native, gate-locale, e2e, package).
    expect(macosJobs(read('.github/workflows/ci.yml'))).toBeLessThanOrEqual(5);
  });
});
