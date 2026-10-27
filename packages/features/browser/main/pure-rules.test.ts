import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Phase 117 Theme H — the browser's pure rules, held to `browser-security.ts`'s no-Electron pattern.
 *
 * Every rule below decides something about a page, a permission, a download, a request or a link, and
 * takes what it touches structurally (a `session`-shaped fake, plain data) so its own test runs under
 * bare vitest. This is the audit made executable, in two parts: each rule has a test file that exists,
 * and no rule's module imports `electron` or `node-pty`, so none can quietly grow a dependency that
 * needs a running app to test. A rule that cannot be tested without Electron belongs behind a seam.
 */

const here = __dirname;
const shared = join(here, '..', '..', '..', 'shared', 'src');

/** The rule, the module that holds it, and where it is tested — paths relative to this directory. */
const RULES: ReadonlyArray<{ rule: string; module: string; test: string }> = [
  { rule: 'session policy (deny-all, devices, downloads)', module: 'browser-security.ts', test: 'browser-security.test.ts' },
  { rule: 'session policy ordering and both partitions', module: 'browser-session-policy.ts', test: 'browser-session-policy.test.ts' },
  { rule: 'webPreferences floor', module: 'browser-security.ts', test: 'web-preferences.test.ts' },
  { rule: 'permission grants', module: 'permission-grant-store.ts', test: 'permission-grant-store.test.ts' },
  { rule: 'IDN display hygiene', module: join(shared, 'lookalike.ts'), test: 'idn-hygiene.test.ts' },
  { rule: 'site verdict state', module: 'site-verdict-state.ts', test: 'site-verdict-state.test.ts' },
  { rule: 'site verdict level and lines', module: join(shared, 'domain', 'site-verdict.ts'), test: join(shared, 'domain', 'site-verdict.test.ts') },
  { rule: 'lookalike hosts', module: join(shared, 'lookalike.ts'), test: join(shared, 'lookalike.test.ts') },
  { rule: 'vulnerable library signatures', module: 'vulnerable-libraries.ts', test: 'vulnerable-libraries.test.ts' },
  { rule: 'download policy', module: 'download-policy.ts', test: 'download-policy.test.ts' },
  { rule: 'download quarantine', module: 'download-quarantine.ts', test: 'download-quarantine.test.ts' },
  { rule: 'tracker filter trie and request filter', module: 'filter-list.ts', test: 'filter-list.test.ts' },
  { rule: 'request filter listeners', module: 'browser-request-filter.ts', test: 'browser-request-filter.test.ts' },
  { rule: 'login-form read', module: 'login-form-read.ts', test: 'login-form-read.test.ts' },
  { rule: 'credential-phishing rules', module: 'phishing-rules.ts', test: 'phishing-rules.test.ts' },
  { rule: 'first-seen ledger', module: 'host-first-seen.ts', test: 'host-first-seen.test.ts' },
  { rule: 'injection heuristics', module: join(shared, 'injection-heuristics.ts'), test: join(shared, 'injection-heuristics.test.ts') },
  { rule: 'clipboard shape (ClickFix)', module: join(shared, 'clickfix.ts'), test: join(shared, 'clickfix.test.ts') },
  { rule: 'clipboard watch', module: 'clipboard-watch.ts', test: 'clipboard-watch.test.ts' },
  { rule: 'agent session boundary', module: 'browser-agent-session.ts', test: 'browser-agent-session.test.ts' },
  { rule: 'untrusted page content envelope', module: join(shared, 'untrusted-page-content.ts'), test: join(shared, 'untrusted-page-content.test.ts') },
  { rule: 'deep-link confirm', module: join(shared, 'page-deep-link.ts'), test: join(shared, 'page-deep-link.test.ts') },
];

const resolve = (path: string) => (path.startsWith('/') ? path : join(here, path));

describe('the browser security rules are all unit-tested (Phase 117 Theme H)', () => {
  it.each(RULES)('$rule has its test file ($test)', ({ test }) => {
    expect(existsSync(resolve(test))).toBe(true);
  });

  it.each(RULES)('$rule is Electron-free ($module)', ({ module }) => {
    const source = readFileSync(resolve(module), 'utf8');
    expect(source).not.toMatch(/from\s+['"](electron|node-pty)['"]/);
    expect(source).not.toMatch(/require\(\s*['"](electron|node-pty)['"]\s*\)/);
  });
});
