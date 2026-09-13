/**
 * The locale pin every parsed subprocess gets. Frozen so a caller cannot mutate the shared object.
 *
 * Prevents localized numeric output (such as `0,7` instead of `0.7` under a comma locale)
 * from breaking decimal parsers across subprocesses. Originally established in
 * `git-exec.ts:36` for git porcelain stability.
 */
export const POSIX_NUMERIC_ENV = Object.freeze({ LC_ALL: 'C', LC_NUMERIC: 'C' } as const);

/**
 * `process.env` with the numeric locale pinned — for a child whose stdout this app parses.
 *
 * If `ps` prints `%CPU` under `LC_NUMERIC=de_DE.UTF-8` or `en_ZA.UTF-8`, the output is
 * `    1     0 Ss    22560   0,7 /sbin/launchd`. Dot-only regexes will fail to match,
 * causing dropped rows or shifted fallback parsing.
 *
 * @param base Ambient or custom process environment (defaults to `process.env`).
 * @returns A new environment object with `POSIX_NUMERIC_ENV` merged on top.
 */
export function parseableProcessEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...base, ...POSIX_NUMERIC_ENV };
}
