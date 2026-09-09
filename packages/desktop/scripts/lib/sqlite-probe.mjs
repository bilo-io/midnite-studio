// The source of the throwaway CJS probe `verify-dist.mjs` runs inside the
// packaged Electron binary to prove `better-sqlite3` actually loads and opens
// a database under Electron's own ABI (Phase 61 Theme C).
//
// It lives here, apart from the script that writes it, for one reason: the
// probe is a *string* the script never executes itself, so nothing in the
// packaging run type-checks or lints it — a typo in it surfaces only as a
// packaged-build failure minutes into CI. Exported from `scripts/lib/`, it is
// reachable by `sqlite-probe.test.mjs`, which runs it under bare `node`
// against a stub module and so pins the one thing the string has to get right:
// which argv slot carries the module path.
//
// Argv under `ELECTRON_RUN_AS_NODE=1` is node's own shape —
// `[execPath, scriptPath, ...args]` — so the module directory the caller
// appends is `argv[2]`. `argv[1]` is the probe file itself; requiring that
// re-enters this module mid-evaluation and yields its still-empty
// `module.exports`, which fails as `TypeError: Database is not a constructor`
// rather than as a missing module.
export const SQLITE_PROBE_SOURCE = [
  'const Database = require(process.argv[2]);',
  'const db = new Database(":memory:");',
  "db.prepare('SELECT 1 AS one').get();",
  'db.close();',
  "console.log('better-sqlite3 loaded and queried successfully under Electron\\'s ABI');",
].join('\n');

// Which `better-sqlite3` the probe should require: the one addressed **through
// `app.asar`**, not the copy sitting in `app.asar.unpacked`.
//
// Both paths reach the same files, but only one reproduces what the shipped app
// does. `asarUnpack` extracts `better-sqlite3` so its `.node` addon is loadable
// (asar cannot load a native addon from inside itself), while its plain-JS
// dependency `bindings` stays in the archive. Require the unpacked directory
// directly and node resolves `bindings` from `app.asar.unpacked/node_modules`,
// which does not contain it — `Cannot find module 'bindings'`. Require it
// through `app.asar` and Electron's asar shim resolves `bindings` inside the
// archive and transparently redirects the `.node` out to the unpacked copy,
// which is exactly the resolution the main process performs at runtime.
//
// So probing the unpacked path would fail on a correctly packaged app, and
// unpacking `bindings` to satisfy it would change packaging to suit the test
// rather than test the packaging.
export function sqliteProbeModulePath(appPath) {
  return `${appPath}/Contents/Resources/app.asar/node_modules/better-sqlite3`;
}
