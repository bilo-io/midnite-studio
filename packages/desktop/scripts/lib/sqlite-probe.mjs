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
