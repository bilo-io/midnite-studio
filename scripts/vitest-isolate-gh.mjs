// A vitest setup file: no test can act as the user on GitHub.
//
// Phase 113 Theme O — a `vi.mock` of a path that had moved silently stopped mocking, and the real
// `createAppIssue` ran: `gh` used the developer's own login and opened a public issue. A stale mock
// does not fail, so the guard cannot live in the mocks. It lives in the environment instead: every
// test worker (and every process it spawns, which inherits this env) sees an empty gh config
// directory and no token variables, so any `gh` a test reaches is logged out and can write nothing.
// The user's real `~/.config/gh` and keychain entry are never read.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.GH_CONFIG_DIR = mkdtempSync(path.join(tmpdir(), 'midnite-test-gh-'));
for (const name of ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN']) {
  delete process.env[name];
}
