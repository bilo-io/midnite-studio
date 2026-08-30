import type { TestFailure } from '@midnite/studio-shared';

/**
 * Reading a test runner's own JSON output — never a shell, never a guess.
 *
 * `vitest --reporter=json` and `playwright test --reporter=json` both write
 * ONE JSON object at the very end of the run, not one line per event — unlike
 * `eslint --format json`'s streaming array, there is nothing to parse
 * incrementally here. The runner spawns the process and hands us the full
 * combined stdout once it closes; this module's job is turning that string
 * into pass/fail/skip counts and a failure list, total over `unknown` like
 * every other parser in this app (`gh-parse.ts`, `parse-eslint.ts`).
 *
 * A runner this build does not recognise — or output that is not JSON at all —
 * is not a bug: `structured: false` plus the raw output is a genuinely useful
 * answer, exactly as the phase doc asks for.
 */

export type ParsedCounts = {
  passed: number;
  failed: number;
  skipped: number;
  failures: TestFailure[];
};

/** Vitest and Jest share this reporter shape — vitest's `json` reporter is Jest-compatible. */
function parseJestLike(data: Record<string, unknown>): ParsedCounts | null {
  const testResults = data['testResults'];
  if (!Array.isArray(testResults)) return null;

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failures: TestFailure[] = [];

  for (const file of testResults) {
    if (typeof file !== 'object' || file === null) continue;
    const filePath = typeof (file as Record<string, unknown>)['name'] === 'string'
      ? ((file as Record<string, unknown>)['name'] as string)
      : null;
    const assertions = (file as Record<string, unknown>)['assertionResults'];
    if (!Array.isArray(assertions)) continue;

    for (const assertion of assertions) {
      if (typeof assertion !== 'object' || assertion === null) continue;
      const a = assertion as Record<string, unknown>;
      const status = typeof a['status'] === 'string' ? a['status'] : '';
      if (status === 'passed') passed += 1;
      else if (status === 'pending' || status === 'skipped' || status === 'todo') skipped += 1;
      else if (status === 'failed') {
        failed += 1;
        const messages = a['failureMessages'];
        const message = Array.isArray(messages) && typeof messages[0] === 'string' ? messages[0] : '';
        const title = typeof a['fullName'] === 'string' ? a['fullName'] : String(a['title'] ?? 'test');
        failures.push({ name: title, file: filePath, message: message.split('\n')[0] ?? '' });
      }
    }
  }

  const total = data['numTotalTests'];
  if (typeof total === 'number') {
    // The suite-level totals, when present, are authoritative — they count
    // tests a reporter's per-assertion list can omit (an aborted file, say).
    passed = typeof data['numPassedTests'] === 'number' ? (data['numPassedTests'] as number) : passed;
    failed = typeof data['numFailedTests'] === 'number' ? (data['numFailedTests'] as number) : failed;
    skipped = typeof data['numPendingTests'] === 'number' ? (data['numPendingTests'] as number) : skipped;
  }

  return { passed, failed, skipped, failures };
}

type PlaywrightSuite = { suites?: unknown; specs?: unknown; title?: unknown };

function walkPlaywrightSuite(suite: unknown, failures: TestFailure[]): void {
  if (typeof suite !== 'object' || suite === null) return;
  const s = suite as PlaywrightSuite;

  if (Array.isArray(s.specs)) {
    for (const spec of s.specs) {
      if (typeof spec !== 'object' || spec === null) continue;
      const sp = spec as Record<string, unknown>;
      const file = typeof sp['file'] === 'string' ? sp['file'] : null;
      const title = typeof sp['title'] === 'string' ? sp['title'] : 'test';
      const tests = sp['tests'];
      if (!Array.isArray(tests)) continue;
      for (const test of tests) {
        if (typeof test !== 'object' || test === null) continue;
        const results = (test as Record<string, unknown>)['results'];
        if (!Array.isArray(results)) continue;
        for (const result of results) {
          if (typeof result !== 'object' || result === null) continue;
          const r = result as Record<string, unknown>;
          const status = typeof r['status'] === 'string' ? r['status'] : '';
          if (status !== 'failed' && status !== 'timedOut') continue;
          const error = r['error'];
          const message =
            typeof error === 'object' && error !== null && typeof (error as Record<string, unknown>)['message'] === 'string'
              ? ((error as Record<string, unknown>)['message'] as string)
              : status;
          failures.push({ name: title, file, message: message.split('\n')[0] ?? '' });
        }
      }
    }
  }
  if (Array.isArray(s.suites)) {
    for (const child of s.suites) walkPlaywrightSuite(child, failures);
  }
}

function parsePlaywright(data: Record<string, unknown>): ParsedCounts | null {
  const stats = data['stats'];
  if (typeof stats !== 'object' || stats === null) return null;
  const s = stats as Record<string, unknown>;
  const passed = typeof s['expected'] === 'number' ? s['expected'] : 0;
  const failed = typeof s['unexpected'] === 'number' ? s['unexpected'] : 0;
  const skipped = typeof s['skipped'] === 'number' ? s['skipped'] : 0;

  const failures: TestFailure[] = [];
  const suites = data['suites'];
  if (Array.isArray(suites)) {
    for (const suite of suites) walkPlaywrightSuite(suite, failures);
  }
  return { passed, failed, skipped, failures };
}

/**
 * The whole answer: parse if this build recognises the shape, `null` if not.
 * The caller falls back to exit-code-plus-raw-output on `null` — never a
 * guess, never a zero-filled result presented as a real one.
 */
export function parseStructuredResult(rawOutput: string): ParsedCounts | null {
  const trimmed = rawOutput.trim();
  if (!trimmed) return null;

  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const obj = data as Record<string, unknown>;

  return parsePlaywright(obj) ?? parseJestLike(obj);
}
