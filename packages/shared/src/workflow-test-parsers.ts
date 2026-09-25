import type { TestFailure } from './domain/tests';

/**
 * Phase 97 Theme E — pure parsers for a `verify` node's `test-counts` check.
 *
 * Four wire formats, named explicitly by the node's own `parser` config field
 * (`WORKFLOW_TEST_COUNT_PARSERS`) rather than sniffed — a verify node's
 * author picks the format their own suite emits, so there is no "which
 * format is this" guess to get wrong at run time. This is a deliberately
 * different contract from `desktop/src/main/testing/reporters.ts`'s
 * `parseStructuredResult` (that module auto-detects vitest/jest/playwright
 * json for the pre-existing "tests" view feature) — `shared` cannot import
 * `desktop` anyway, so the two modules are independent by construction, and
 * this one adds `junit-xml`/`tap` that the other has never needed.
 *
 * Every parser here is `null` on input it does not recognise — never a
 * zero-filled result presented as a real one, the same discipline every
 * other parser in this app follows (`gh-parse.ts`, `parse-eslint.ts`,
 * `reporters.ts`'s own doc comment).
 */

export const WORKFLOW_TEST_COUNT_PARSERS = ['vitest', 'jest', 'junit-xml', 'tap'] as const;
export type WorkflowTestCountParser = (typeof WORKFLOW_TEST_COUNT_PARSERS)[number];

/** What every parser below yields — the phase doc's `{passed, failed, skipped}`, plus a failure list for the verify node's own evidence. */
export type WorkflowTestCounts = {
  passed: number;
  failed: number;
  skipped: number;
  failures: TestFailure[];
};

/**
 * `vitest --reporter=json` and `jest --json` share this shape — vitest's own
 * json reporter is Jest-compatible, so one parser serves both `parser`
 * values. Structurally the same read as `reporters.ts`'s `parseJestLike`
 * (that module's sibling for the auto-sniffed case); duplicated rather than
 * imported because `shared` cannot depend on `desktop`.
 */
function parseJestLikeTestCounts(raw: string): WorkflowTestCounts | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const obj = data as Record<string, unknown>;
  const testResults = obj['testResults'];
  if (!Array.isArray(testResults)) return null;

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failures: TestFailure[] = [];

  for (const file of testResults) {
    if (typeof file !== 'object' || file === null) continue;
    const f = file as Record<string, unknown>;
    const filePath = typeof f['name'] === 'string' ? f['name'] : null;
    const assertions = f['assertionResults'];
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
        const message =
          Array.isArray(messages) && typeof messages[0] === 'string' ? (messages[0].split('\n')[0] ?? '') : '';
        const title = typeof a['fullName'] === 'string' ? a['fullName'] : String(a['title'] ?? 'test');
        failures.push({ name: title, file: filePath, message });
      }
    }
  }

  const total = obj['numTotalTests'];
  if (typeof total === 'number') {
    // Suite-level totals, when present, are authoritative — they count tests
    // a per-assertion list can omit (an aborted file, say).
    passed = typeof obj['numPassedTests'] === 'number' ? (obj['numPassedTests'] as number) : passed;
    failed = typeof obj['numFailedTests'] === 'number' ? (obj['numFailedTests'] as number) : failed;
    skipped = typeof obj['numPendingTests'] === 'number' ? (obj['numPendingTests'] as number) : skipped;
  }

  return { passed, failed, skipped, failures };
}

function attrNum(tag: string, name: string): number {
  const match = new RegExp(`${name}="(\\d+)"`).exec(tag);
  return match ? Number(match[1]) : 0;
}

/**
 * JUnit XML — the format most non-JS test runners (and `--reporter=junit`
 * flavours) emit. Regex-based rather than a real XML parser: `shared`
 * carries no parsing dependency, matching this app's other string parsers,
 * and a fixture-tested pure function only has to be right about the shapes
 * its own fixtures cover, not arbitrary XML.
 */
function parseJUnitXmlTestCounts(raw: string): WorkflowTestCounts | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('<')) return null;

  const suiteTags = [...trimmed.matchAll(/<testsuite\b[^>]*>/g)];
  if (suiteTags.length === 0) return null;

  let tests = 0;
  let suiteFailures = 0;
  let errors = 0;
  let skipped = 0;
  for (const [tag] of suiteTags) {
    tests += attrNum(tag, 'tests');
    suiteFailures += attrNum(tag, 'failures');
    errors += attrNum(tag, 'errors');
    skipped += attrNum(tag, 'skipped');
  }
  const failed = suiteFailures + errors;
  const passed = Math.max(0, tests - failed - skipped);

  const failures: TestFailure[] = [];
  const caseRegex = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
  for (const match of trimmed.matchAll(caseRegex)) {
    const attrs = match[1] ?? '';
    const body = match[2] ?? '';
    const failureMatch = /<(?:failure|error)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:failure|error)>)/.exec(body);
    if (!failureMatch) continue;
    // `\b` before `name=` matters: `classname="pkg.A"` would otherwise match
    // its own trailing `name="pkg.A"` substring for the bare pattern.
    const name = /\bname="([^"]*)"/.exec(attrs)?.[1] ?? 'test';
    const classname = /\bclassname="([^"]*)"/.exec(attrs)?.[1] ?? null;
    const messageAttr = /message="([^"]*)"/.exec(failureMatch[1] ?? '')?.[1];
    const bodyFirstLine = (failureMatch[2] ?? '').trim().split('\n')[0];
    failures.push({ name, file: classname, message: (messageAttr ?? bodyFirstLine ?? 'failed').trim() });
  }

  return { passed, failed, skipped, failures };
}

/**
 * TAP (Test Anything Protocol) — `ok`/`not ok` lines, an optional `# SKIP`/
 * `# TODO` directive read as skipped rather than pass/fail. The `1..N` plan
 * line and any `---`/YAML diagnostic block are ignored; only the per-test
 * result lines carry counts.
 */
function parseTapTestCounts(raw: string): WorkflowTestCounts | null {
  const lineRegex = /^(ok|not ok)\s+\d+(?:\s*-\s*([^#]*))?(?:#\s*(\S+)(.*))?$/i;

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let sawAny = false;
  const failures: TestFailure[] = [];

  for (const rawLine of raw.split(/\r?\n/)) {
    const match = lineRegex.exec(rawLine.trim());
    if (!match) continue;
    sawAny = true;
    const okToken = match[1]!.toLowerCase();
    const description = (match[2] ?? '').trim() || 'test';
    const directive = match[3];
    const directiveRest = match[4] ?? '';

    if (directive !== undefined && /^(skip|todo)$/i.test(directive)) {
      skipped += 1;
      continue;
    }
    if (okToken === 'ok') {
      passed += 1;
    } else {
      failed += 1;
      failures.push({ name: description, file: null, message: directiveRest.trim() || description });
    }
  }

  if (!sawAny) return null;
  return { passed, failed, skipped, failures };
}

/** The whole answer: dispatch on the node's own explicit `parser` choice. `null` when this build cannot make sense of the output. */
export function parseWorkflowTestCounts(parser: WorkflowTestCountParser, raw: string): WorkflowTestCounts | null {
  switch (parser) {
    case 'vitest':
    case 'jest':
      return parseJestLikeTestCounts(raw);
    case 'junit-xml':
      return parseJUnitXmlTestCounts(raw);
    case 'tap':
      return parseTapTestCounts(raw);
    default: {
      const exhaustive: never = parser;
      return exhaustive;
    }
  }
}
