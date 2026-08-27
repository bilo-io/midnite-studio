import { z } from 'zod';

/**
 * A repository's own test suites — discovered, never invented.
 *
 * The shape mirrors `diagnostics.ts` deliberately: a suite carries an argument
 * vector (never a shell string — the runner spawns it directly, same reasoning
 * as the linter), and trust is granted per suite rather than per repository,
 * because a repo's package.json can name a dozen scripts and approving one
 * (`test`) says nothing about another (`e2e`, which drives a real browser).
 *
 * Discovery itself executes nothing — it reads `package.json` scripts, a
 * package's `moon.yml` (if this is a moon workspace) and the presence of
 * `vitest.config.*` / `playwright.config.*` / `jest.config.*` /
 * `cypress.config.*`, all in `git-engine` so it stays testable under bare
 * vitest. Execution (Theme G) is desktop's `main/testing/` — the same split as
 * `detect.ts` (proposes) vs `runner.ts` (runs) in diagnostics.
 */

/** How a suite was classified. `other` is the honest fallback for anything unrecognised. */
export const TEST_SUITE_KINDS = [
  'unit',
  'integration',
  'smoke',
  'e2e',
  'lint',
  'typecheck',
  'other',
] as const;
export const TestSuiteKindSchema = z.enum(TEST_SUITE_KINDS);
export type TestSuiteKind = z.infer<typeof TestSuiteKindSchema>;

/** Where the suite came from — the Tests view shows this beside the suite's name. */
export const TestSuiteSourceSchema = z.enum(['package.json', 'moon.yml']);
export type TestSuiteSource = z.infer<typeof TestSuiteSourceSchema>;

/**
 * An argument vector, never a shell string — the `DiagnosticsCommand` rule.
 * `cwd` travels with it because a monorepo suite runs from its own package
 * directory (or, for a moon task, from the workspace root moon itself expects).
 */
export const TestRunCommandSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()),
  cwd: z.string().min(1),
});
export type TestRunCommand = z.infer<typeof TestRunCommandSchema>;

/** One discovered, runnable suite. */
export const TestSuiteSchema = z.object({
  /** Stable within a repository: `${package}::${name}`. */
  id: z.string().min(1),
  /** POSIX-relative to the checkout; `''` for the workspace root itself. */
  package: z.string(),
  packageName: z.string(),
  /** The script or task name that declared it — `test`, `e2e`, `smoke`… */
  name: z.string().min(1),
  kind: TestSuiteKindSchema,
  source: TestSuiteSourceSchema,
  /** POSIX-relative path to the file that declared it, for the "source" column. */
  sourceFile: z.string().min(1),
  /** The literal command, space-joined, for display — lossy, like `commandLine`. */
  displayCommand: z.string().min(1),
  run: TestRunCommandSchema,
});
export type TestSuite = z.infer<typeof TestSuiteSchema>;

/** One package's suites, for the monorepo-aware package → suite tree. */
export const TestPackageSchema = z.object({
  /** POSIX-relative to the checkout; `''` for the workspace root. */
  path: z.string(),
  name: z.string(),
  suites: z.array(TestSuiteSchema),
});
export type TestPackage = z.infer<typeof TestPackageSchema>;

export const TestDiscoverySchema = z.object({
  repoId: z.string(),
  packages: z.array(TestPackageSchema),
  generatedAt: z.number().int().nonnegative(),
});
export type TestDiscovery = z.infer<typeof TestDiscoverySchema>;

/**
 * A fingerprint of what would run — NUL-joined for the same reason
 * `commandFingerprint` is: an argument may contain spaces, and any printable
 * separator makes two different vectors compare equal.
 */
export function testSuiteFingerprint(suite: TestSuite): string {
  return [suite.run.command, ...suite.run.args, suite.run.cwd].join('\0');
}

// --- trust (Theme G) ---------------------------------------------------------

/**
 * Per-suite, unlike diagnostics' single per-repo grant: a repository's suites
 * are independent programs (a fast `vitest` run and a real-browser `playwright`
 * run are not the same proposition), so approving one must not silently
 * approve the rest.
 */
export const TestTrustStateSchema = z.enum(['untrusted', 'trusted']);
export type TestTrustState = z.infer<typeof TestTrustStateSchema>;

export const TestTrustStatusSchema = z.object({
  state: TestTrustStateSchema,
  trustedAt: z.number().int().nonnegative().nullable(),
});
export type TestTrustStatus = z.infer<typeof TestTrustStatusSchema>;

// --- execution results (Theme G) ---------------------------------------------

/**
 * Why a run produced nothing usable — the diagnostics `DIAGNOSTICS_REASONS`
 * shape, with `no-suite` in place of `no-command`.
 */
export const TEST_RUN_REASONS = [
  'no-suite',
  'untrusted',
  'not-installed',
  'timed-out',
  'parse-failed',
] as const;
export const TestRunReasonSchema = z.enum(TEST_RUN_REASONS);
export type TestRunReason = z.infer<typeof TestRunReasonSchema>;

export const TestFailureSchema = z.object({
  name: z.string(),
  file: z.string().nullable(),
  message: z.string(),
});
export type TestFailure = z.infer<typeof TestFailureSchema>;

/**
 * `structured: false` is the honest fallback for a runner this build cannot
 * parse — `passed`/`failed`/`skipped` are all zero and `output` plus `exitCode`
 * are the whole answer, exactly as the phase doc asks for.
 */
export const TestRunResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    structured: z.boolean(),
    exitCode: z.number().int().nullable(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    failures: z.array(TestFailureSchema),
    /** Capped combined stdout/stderr — the fallback's whole story, and the
     *  structured case's evidence when the counts alone are not enough. */
    output: z.string(),
    truncated: z.boolean(),
    ranAt: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative(),
  }),
  z.object({
    ok: z.literal(false),
    reason: TestRunReasonSchema,
    hint: z.string(),
  }),
]);
export type TestRunResult = z.infer<typeof TestRunResultSchema>;
