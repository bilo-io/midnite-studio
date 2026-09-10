import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SQLITE_PROBE_SOURCE, sqliteProbeModulePath } from './sqlite-probe.mjs';

// A stand-in for better-sqlite3 that satisfies exactly the surface the probe
// touches. The point is not to test SQLite — it is to run the probe under bare
// `node`, where a wrong argv slot is a plain failure rather than a packaged
// build that took two minutes to produce.
const STUB_MODULE = `class Database {
  constructor(path) {
    if (path !== ':memory:') throw new Error('unexpected path: ' + path);
  }
  prepare(sql) {
    return { get: () => ({ one: 1 }) };
  }
  close() {}
}
module.exports = Database;
`;

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sqlite-probe-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('SQLITE_PROBE_SOURCE', () => {
  it('resolves its module from the argument after the script path', () => {
    const probePath = join(dir, '.better-sqlite3-probe.cjs');
    const modulePath = join(dir, 'stub-better-sqlite3.cjs');
    writeFileSync(probePath, SQLITE_PROBE_SOURCE);
    writeFileSync(modulePath, STUB_MODULE);

    // Same invocation shape verify-dist.mjs uses: the module directory is
    // appended *after* the script path, so the probe must read argv[2].
    const out = execFileSync(process.execPath, [probePath, modulePath], {
      encoding: 'utf8',
    });

    expect(out).toContain('better-sqlite3 loaded and queried successfully');
  });

  it('never requires the probe file itself', () => {
    // The original bug: `require(process.argv[1])` re-entered the probe, whose
    // `module.exports` is still empty, so the failure read as
    // "Database is not a constructor" instead of a missing module.
    expect(SQLITE_PROBE_SOURCE).not.toContain('process.argv[1]');
    expect(SQLITE_PROBE_SOURCE).toContain('process.argv[2]');
  });
});

describe('sqliteProbeModulePath', () => {
  const appPath = '/tmp/release/mac-arm64/Midnite Studio.app';

  it('addresses better-sqlite3 through app.asar, as the main process does', () => {
    expect(sqliteProbeModulePath(appPath)).toBe(
      `${appPath}/Contents/Resources/app.asar/node_modules/better-sqlite3`,
    );
  });

  it('never addresses the unpacked copy directly', () => {
    // The unpacked directory holds the `.node` addon but not better-sqlite3's
    // plain-JS dependency `bindings`, which stays inside the archive. Probing
    // it fails with `Cannot find module 'bindings'` on an app that is packaged
    // perfectly well — a false failure this check must not produce.
    expect(sqliteProbeModulePath(appPath)).not.toContain('app.asar.unpacked');
  });
});
