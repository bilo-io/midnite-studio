import type { TestSuiteKind } from '@midnite/git-shared';

/**
 * What kind of suite a script or task is — config file first, script-name
 * heuristics second, `other` the honest fallback.
 *
 * "Config file first" means the four discovery configs
 * (`vitest`/`playwright`/`jest`/`cypress`) decide the unit/e2e split whenever
 * the command actually runs that tool AND its config is present — that pairing
 * is unambiguous. Lint and typecheck have no config-presence signal in this
 * phase's scope (an eslint/tsc invocation always means what it says), so they
 * are read from the command directly. Everything else — `integration`,
 * `smoke`, and disambiguating `e2e` from a script name alone — has no config
 * file to lean on at all, so the script's own name is what answers it: this
 * repo's own `smoke: tsx scripts/smoke.ts` has no config of any kind and is
 * legible only by its name.
 */

export type PresentConfigs = {
  vitest: boolean;
  playwright: boolean;
  jest: boolean;
  cypress: boolean;
};

const NAME_KEYWORDS: readonly { re: RegExp; kind: TestSuiteKind }[] = [
  { re: /(^|[:\-_])lint($|[:\-_])/i, kind: 'lint' },
  { re: /(^|[:\-_])type.?check($|[:\-_])/i, kind: 'typecheck' },
  { re: /(^|[:\-_])e2e($|[:\-_])/i, kind: 'e2e' },
  { re: /(^|[:\-_])integration($|[:\-_])/i, kind: 'integration' },
  { re: /(^|[:\-_])smoke($|[:\-_])/i, kind: 'smoke' },
];

/** Does this script/task name look test-ish at all — the inclusion gate. */
const CANDIDATE_NAME = /(^|[:\-_])(test|tests|e2e|smoke|integration|lint|type.?check|check)($|[:\-_])/i;

const RUNNER_COMMAND: readonly { re: RegExp; kind: TestSuiteKind; config: keyof PresentConfigs | null }[] =
  [
    { re: /\bplaywright\b/, kind: 'e2e', config: 'playwright' },
    { re: /\bcypress\b/, kind: 'e2e', config: 'cypress' },
    { re: /\bvitest\b/, kind: 'unit', config: 'vitest' },
    { re: /\bjest\b/, kind: 'unit', config: 'jest' },
    { re: /\b(mocha|ava|tap)\b/, kind: 'unit', config: null },
    { re: /\beslint\b/, kind: 'lint', config: null },
    { re: /\btsc\b/, kind: 'typecheck', config: null },
  ];

/** Names that are build/dev tooling even when they'd otherwise match a runner. */
export const EXCLUDED_SCRIPT_NAMES = new Set([
  'dev',
  'build',
  'start',
  'preview',
  'bundle',
  'dist',
  'postinstall',
  'install',
  'clean',
  'format',
  'release',
  'publish',
  'watch',
]);

/** Is `name`/`command` worth proposing as a suite at all? */
export function isCandidateScript(name: string, command: string): boolean {
  if (EXCLUDED_SCRIPT_NAMES.has(name)) return false;
  if (CANDIDATE_NAME.test(name)) return true;
  return RUNNER_COMMAND.some((r) => r.re.test(command));
}

export function classifySuite(
  name: string,
  command: string,
  configs: PresentConfigs,
): TestSuiteKind {
  // Config-gated runner match, when both the tool and its config are present —
  // the one case unambiguous enough to outrank a generic name.
  for (const runner of RUNNER_COMMAND) {
    if (runner.re.test(command) && runner.config && configs[runner.config]) return runner.kind;
  }
  for (const { re, kind } of NAME_KEYWORDS) {
    if (re.test(name)) return kind;
  }
  for (const runner of RUNNER_COMMAND) {
    if (runner.re.test(command)) return runner.kind;
  }
  return 'other';
}
