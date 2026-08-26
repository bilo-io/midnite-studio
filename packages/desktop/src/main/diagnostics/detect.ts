import { access, constants } from 'node:fs/promises';
import { join } from 'node:path';

import {
  DIAGNOSTICS_PARSERS,
  commandFingerprint,
  type DiagnosticsCandidate,
  type DiagnosticsCommand,
  type DiagnosticsEcosystem,
} from '@midnite/git-shared';

/**
 * Working out what a repository could be linted with — and proposing it.
 *
 * **Propose, never invent.** A detector fires only on something it can point
 * at, and every candidate carries the `evidence` that made it fire so the
 * trust prompt can show why this command is being offered. A repository with no
 * recognised tooling produces an empty list; it never gets a plausible guess,
 * because a guess is a command the user would be approving on our say-so.
 *
 * ## Why a registry rather than an eslint check
 *
 * The obvious shape here is "look for node_modules/.bin/eslint" — and it is
 * wrong, because this app is not a JavaScript tool. A repository opened in it
 * is as likely to be Go with a Makefile, a language-agnostic `moon.yml`,
 * dotnet, python or C++ with a build system nobody has thought about since
 * 2009. Baking eslint into the control flow would make every one of those a
 * rewrite rather than a new file.
 *
 * So a detector is a pure function with a stable shape:
 *
 * ```ts
 * const golangciLint: Detector = {
 *   id: 'golangci-lint',
 *   ecosystem: 'go',
 *   label: 'golangci-lint',
 *   detect: async (workdir, fs) => {
 *     const config = await firstPresent(workdir, fs, ['.golangci.yml', '.golangci.yaml']);
 *     const bin = await firstExecutable(fs, [join(workdir, 'bin/golangci-lint')]);
 *     if (!config || !bin) return null;
 *     return { detectorId: 'golangci-lint', ecosystem: 'go', label: 'golangci-lint',
 *              command: bin, args: ['run', '--out-format', 'json'],
 *              parser: 'golangci', evidence: [config] };
 *   },
 * };
 * ```
 *
 * Adding Go is that object plus a `parse-golangci.ts`. Nothing here changes.
 *
 * ## The parser gate
 *
 * A detector may name a parser this build does not ship, and
 * `detectCandidates` drops it. That is the honest half of the design: without
 * the gate we could happily propose `make lint` for a C++ repo, the user would
 * approve it, and every run would come back `parse-failed` — a feature that
 * looks enabled and reports nothing. Dropping it means a C++ repo offers
 * nothing *yet*, which is at least true.
 */

export type DetectFs = {
  /** Does a path exist (of any type)? */
  exists: (absPath: string) => Promise<boolean>;
  /** Does a path exist and carry the execute bit? */
  isExecutable: (absPath: string) => Promise<boolean>;
};

export type Detector = {
  id: string;
  ecosystem: DiagnosticsEcosystem;
  label: string;
  detect: (workdir: string, fs: DetectFs) => Promise<DiagnosticsCandidate | null>;
};

/** The real filesystem. Injected everywhere else so detectors test as pure functions. */
export const realDetectFs: DetectFs = {
  exists: async (absPath) => {
    try {
      await access(absPath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  },
  isExecutable: async (absPath) => {
    try {
      await access(absPath, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  },
};

/** First name in `names` that exists under `workdir`, relative — or `null`. */
async function firstPresent(
  workdir: string,
  fs: DetectFs,
  names: readonly string[],
): Promise<string | null> {
  for (const name of names) {
    if (await fs.exists(join(workdir, name))) return name;
  }
  return null;
}

/**
 * eslint's flat config, and its predecessor.
 *
 * Two detectors rather than one with a longer list, so the ranking is a
 * property of the registry order rather than of an array's contents: a repo
 * mid-migration has both files, and the flat one is what eslint 9 will
 * actually read.
 */
const FLAT_CONFIGS = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
] as const;

const LEGACY_CONFIGS = [
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yaml',
  '.eslintrc.yml',
  '.eslintrc',
] as const;

/**
 * The repo-local eslint binary.
 *
 * `node_modules/.bin/eslint` and nothing else — no PATH lookup, no
 * `command -v`. A path we resolved on disk ourselves is why the runner can
 * spawn an argument vector with no shell involved at all, and a globally
 * installed eslint would lint with the wrong config and the wrong plugin
 * versions anyway.
 */
const ESLINT_BIN = join('node_modules', '.bin', 'eslint');

/**
 * `.` plus a machine-readable format.
 *
 * No `--ext`: it was removed in eslint 9 and flat config decides its own file
 * set. No `--fix`, obviously, and no `--max-warnings`, which would turn a
 * warning count into an exit code we then have to un-interpret.
 */
const ESLINT_ARGS = ['.', '--format', 'json'] as const;

function eslintDetector(
  id: string,
  label: string,
  configs: readonly string[],
): Detector {
  return {
    id,
    ecosystem: 'javascript',
    label,
    detect: async (workdir, fs) => {
      const bin = join(workdir, ESLINT_BIN);
      if (!(await fs.isExecutable(bin))) return null;
      const config = await firstPresent(workdir, fs, configs);
      // Both halves required. A binary with no config is usually a transitive
      // dependency of something else, and proposing it buys a run that exits
      // with "couldn't find a configuration file".
      if (config === null) return null;

      return {
        detectorId: id,
        ecosystem: 'javascript',
        label,
        command: bin,
        args: [...ESLINT_ARGS],
        parser: 'eslint',
        evidence: [ESLINT_BIN, config],
      };
    },
  };
}

/**
 * Ordered: the first candidate is the one the UI offers by default.
 *
 * Flat config outranks legacy because eslint 9 reads it in preference, so for a
 * repo carrying both, the flat one describes what a run would actually do.
 */
export const DETECTORS: readonly Detector[] = [
  eslintDetector('eslint-flat', 'ESLint (flat config)', FLAT_CONFIGS),
  eslintDetector('eslint-legacy', 'ESLint (.eslintrc)', LEGACY_CONFIGS),
];

export type DetectDeps = {
  fs?: DetectFs;
  detectors?: readonly Detector[];
};

/**
 * Every candidate for a checkout, ranked, with unreadable ones removed.
 *
 * A detector that throws is treated as one that found nothing: detection runs
 * speculatively whenever a repo is selected, and a bug in one detector must not
 * cost the others their answer.
 */
export async function detectCandidates(
  workdir: string,
  deps: DetectDeps = {},
): Promise<DiagnosticsCandidate[]> {
  const fs = deps.fs ?? realDetectFs;
  const detectors = deps.detectors ?? DETECTORS;
  const supported = new Set<string>(DIAGNOSTICS_PARSERS);

  const found: DiagnosticsCandidate[] = [];
  for (const detector of detectors) {
    let candidate: DiagnosticsCandidate | null = null;
    try {
      candidate = await detector.detect(workdir, fs);
    } catch {
      continue;
    }
    if (!candidate) continue;
    // The gate: a proposal we could not read the output of is worse than none.
    if (!supported.has(candidate.parser)) continue;
    found.push(candidate);
  }
  return found;
}

/**
 * Is this command one the registry actually proposed?
 *
 * The single most security-relevant decision in the feature, so it lives here
 * as a pure function rather than inline in the IPC handler: the handler needs
 * `electron`, which would put this check behind a module that cannot be unit
 * tested, and "the renderer may only confirm what main offered" is exactly the
 * rule that has to keep working when someone edits the handler later.
 *
 * Compared by fingerprint rather than by identity or by executable path, so a
 * matching binary with different arguments does not pass — `--fix` is a
 * different proposition from `--format json`, and only one of them was on
 * screen when the user clicked Enable.
 */
export function isProposedCommand(
  command: DiagnosticsCommand,
  candidates: readonly DiagnosticsCandidate[],
): boolean {
  const fingerprint = commandFingerprint(command);
  return candidates.some((candidate) => commandFingerprint(candidate) === fingerprint);
}
