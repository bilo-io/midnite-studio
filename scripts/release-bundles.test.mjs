// Phase 113 Theme F1 — what a tag-push release builds, and that it stays inside the macOS cap.
// Plain vitest/node: reads release.yml and ci.yml as text, no browser needed.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { packBundle } from './pack-bundle.mjs';
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
  const next = rest.search(/^ {2}[a-z][a-z0-9-]*:$/m);
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

describe('retired apps (Phase 124 Theme H)', () => {
  const has = (dir) => existsSync(path.join(repoRoot, dir, 'moon.yml'));
  const apps = allApps(readdirSync(path.join(repoRoot, 'apps')), has);
  it.each(['coder', 'creator', 'cleaner', 'vault', 'monitor', 'capture'])('%s has no bundle and no apps/ directory', (id) => {
    expect(existsSync(path.join(repoRoot, 'apps', id))).toBe(false);
    expect(apps).not.toContain(id);
    expect(bundleMatrix(apps, has).include.map((e) => e.app)).not.toContain(id);
  });
  it('the hosts that absorbed them still ship', () => {
    for (const host of ['agents', 'media', 'gamer', 'vanguard', 'mind']) expect(apps).toContain(host);
  });
});

describe('apps/mind (Theme M)', () => {
  const has = (dir) => existsSync(path.join(repoRoot, dir, 'moon.yml'));
  const apps = allApps(readdirSync(path.join(repoRoot, 'apps')), has);
  it('is in the --all matrix, as app-mind, with the icon a release needs to pack it', () => {
    expect(bundleMatrix(apps, has).include).toContainEqual({ app: 'mind', project: 'app-mind', dir: 'apps/mind' });
    const icns = readFileSync(path.join(repoRoot, 'apps/mind/resources/icon.icns'));
    expect(icns.subarray(0, 4).toString('ascii')).toBe('icns');
  });
});

describe('apps/money (Theme P)', () => {
  const has = (dir) => existsSync(path.join(repoRoot, dir, 'moon.yml'));
  const apps = allApps(readdirSync(path.join(repoRoot, 'apps')), has);
  it('is in the --all matrix, as app-money, with the icon a release needs to pack it', () => {
    expect(bundleMatrix(apps, has).include).toContainEqual({ app: 'money', project: 'app-money', dir: 'apps/money' });
    const icns = readFileSync(path.join(repoRoot, 'apps/money/resources/icon.icns'));
    expect(icns.subarray(0, 4).toString('ascii')).toBe('icns');
  });
});

describe('apps/gamer (Theme S)', () => {
  const has = (dir) => existsSync(path.join(repoRoot, dir, 'moon.yml'));
  const apps = allApps(readdirSync(path.join(repoRoot, 'apps')), has);
  it('is in the --all matrix, as app-gamer, with the icon a release needs to pack it', () => {
    expect(bundleMatrix(apps, has).include).toContainEqual({ app: 'gamer', project: 'app-gamer', dir: 'apps/gamer' });
    const icns = readFileSync(path.join(repoRoot, 'apps/gamer/resources/icon.icns'));
    expect(icns.subarray(0, 4).toString('ascii')).toBe('icns');
  });
});

describe('apps/media (Theme R)', () => {
  const has = (dir) => existsSync(path.join(repoRoot, dir, 'moon.yml'));
  const apps = allApps(readdirSync(path.join(repoRoot, 'apps')), has);
  it('is in the --all matrix, as app-media, with the icon a release needs to pack it', () => {
    expect(bundleMatrix(apps, has).include).toContainEqual({ app: 'media', project: 'app-media', dir: 'apps/media' });
    const icns = readFileSync(path.join(repoRoot, 'apps/media/resources/icon.icns'));
    expect(icns.subarray(0, 4).toString('ascii')).toBe('icns');
  });
});

describe('apps/vanguard (Phase 120 Theme B)', () => {
  const has = (dir) => existsSync(path.join(repoRoot, dir, 'moon.yml'));
  const apps = allApps(readdirSync(path.join(repoRoot, 'apps')), has);
  it('is in the --all matrix, as app-vanguard, with the icon a release needs to pack it', () => {
    expect(bundleMatrix(apps, has).include).toContainEqual({ app: 'vanguard', project: 'app-vanguard', dir: 'apps/vanguard' });
    const icns = readFileSync(path.join(repoRoot, 'apps/vanguard/resources/icon.icns'));
    expect(icns.subarray(0, 4).toString('ascii')).toBe('icns');
  });
});

describe('apps/agents (Theme N)', () => {
  const has = (dir) => existsSync(path.join(repoRoot, dir, 'moon.yml'));
  const apps = allApps(readdirSync(path.join(repoRoot, 'apps')), has);
  it('is in the --all matrix, as app-agents, with the icon a release needs to pack it', () => {
    expect(bundleMatrix(apps, has).include).toContainEqual({ app: 'agents', project: 'app-agents', dir: 'apps/agents' });
    const icns = readFileSync(path.join(repoRoot, 'apps/agents/resources/icon.icns'));
    expect(icns.subarray(0, 4).toString('ascii')).toBe('icns');
  });
});

describe('apps/browser (Theme L)', () => {
  const has = (dir) => existsSync(path.join(repoRoot, dir, 'moon.yml'));
  const apps = allApps(readdirSync(path.join(repoRoot, 'apps')), has);
  it('is in the --all matrix, as app-browser, with the icon a release needs to pack it', () => {
    expect(bundleMatrix(apps, has).include).toContainEqual({ app: 'browser', project: 'app-browser', dir: 'apps/browser' });
    const icns = readFileSync(path.join(repoRoot, 'apps/browser/resources/icon.icns'));
    expect(icns.subarray(0, 4).toString('ascii')).toBe('icns');
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
    expect(bundles).toContain('scripts/pack-bundle.mjs');
    expect(read('scripts/pack-bundle.mjs')).toContain('-bundle.zip');
    expect(bundles).not.toMatch(/runs-on:\s*macos-/);
  });
  it('publishes the launcher, bundles and catalog.json only after Studio and its feed', () => {
    const suite = job(release, 'publish-suite');
    // `assemble` already waits on `bundles`; the suite needs it, plus Studio's release and feed.
    expect(suite).toContain('needs: [meta, assemble, release, publish-feed]');
    expect(suite).toContain('tag_name: midnite-launcher/${{ needs.meta.outputs.tag }}');
    expect(suite).toContain('name: launcher-mac-arm64');
    expect(suite).toContain('pattern: bundle-*');
    expect(suite).toContain('name: release-assembly');
    expect(suite).toContain('git add catalog.json midnite-launcher/feed/latest-mac.yml');
    expect(suite).not.toMatch(/runs-on:\s*macos-/);
    // The Studio release itself still takes only Studio's artifact.
    expect(job(release, 'release')).not.toContain('launcher-mac-arm64');
  });
  it('builds and validates catalog.json in `assemble`, before any publishing job', () => {
    const assemble = job(release, 'assemble');
    expect(assemble).toContain('node scripts/build-catalog.mjs');
    expect(assemble).toContain('node scripts/validate-catalog.mjs');
    expect(assemble).toContain('needs: [meta, build, plan, bundles]');
    for (const name of ['release', 'publish-feed', 'publish-suite']) {
      expect(job(release, name)).toContain('assemble');
    }
  });
  it('gates every write behind !dry_run and gives every job meta', () => {
    for (const name of ['build', 'plan', 'bundles', 'assemble', 'release', 'publish-feed', 'publish-suite']) {
      expect(job(release, name)).toMatch(/needs:.*\bmeta\b/);
    }
    expect(job(release, 'release')).toContain("needs.meta.outputs.dry_run == 'false'");
    for (const name of ['publish-feed', 'publish-suite']) {
      const j = job(release, name);
      expect(j).toMatch(/- name: Checkout bilo-io\/midnite-apps\n\s+if: \$\{\{ needs\.meta\.outputs\.dry_run == 'false' \}\}/);
      expect(j).toMatch(/- name: Commit \+ push\n\s+if: \$\{\{ needs\.meta\.outputs\.dry_run == 'false' \}\}/);
      expect(j).toContain('git pull --rebase');
    }
    expect(job(release, 'publish-suite')).toMatch(/Publish the launcher release[^\n]*\n\s+if: \$\{\{ needs\.meta\.outputs\.dry_run == 'false' \}\}/);
    // No job derives the version from the ref any more: on a dispatch it is a branch.
    expect(release.replace(/^\s*#.*$/gm, '')).not.toMatch(/GITHUB_REF(_NAME)?#|\$\{GITHUB_REF/);
  });
  it('uses one macOS job, and CI stays at or under the cap of 5 concurrent', () => {
    expect(macosJobs(release)).toBe(1);
    // ci.yml's count is the baseline this slice did not raise (gate-native, e2e, package).
    expect(macosJobs(read('.github/workflows/ci.yml'))).toBeLessThanOrEqual(5);
  });
});

describe('packBundle (Theme H2)', () => {
  const mk = (withMain) => {
    const root = mkdtempSync(path.join(tmpdir(), 'pack-test-'));
    mkdirSync(path.join(root, 'dist'), { recursive: true });
    mkdirSync(path.join(root, 'resources'));
    writeFileSync(path.join(root, 'dist', 'index.html'), '<html></html>');
    if (withMain) writeFileSync(path.join(root, 'dist', 'main.cjs'), '');
    writeFileSync(path.join(root, 'resources', 'icon.icns'), 'icns');
    return root;
  };
  const listing = (zip) => execFileSync('unzip', ['-Z1', zip]).toString().split('\n').filter(Boolean).sort();
  const manifest = (zip) => JSON.parse(execFileSync('unzip', ['-p', zip, 'package.json']).toString());

  it('names main.cjs as `main` when the build wrote one, and packs it', () => {
    const root = mk(true);
    const zip = packBundle({ app: 'x', dir: root, version: '1.2.3', out: path.join(root, 'out') });
    expect(listing(zip)).toEqual(['icon.icns', 'index.html', 'main.cjs', 'package.json']);
    expect(manifest(zip)).toEqual({ name: 'midnite-x', version: '1.2.3', main: 'main.cjs' });
  });
  it('leaves `main` off an app with no Electron side', () => {
    const root = mk(false);
    expect(manifest(packBundle({ app: 'x', dir: root, version: '1.2.3', out: path.join(root, 'out') }))).toEqual({
      name: 'midnite-x',
      version: '1.2.3',
    });
  });
  it('refuses an app with no icon', () => {
    const root = mk(true);
    rmSync(path.join(root, 'resources', 'icon.icns'));
    expect(() => packBundle({ app: 'x', dir: root, version: '1', out: root })).toThrow(/icon\.icns/);
  });
});
