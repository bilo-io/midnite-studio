import type { SystemCacheEntryId } from './system-cache-registry';

/**
 * Phase 73 Theme D — vendor reclaim commands, run through the existing
 * trusted-spawn primitive (`process-runner.ts`'s `runProcess`/`realSpawn`),
 * unmodified. A `costly` entry with a registered command here offers it as
 * the *default* action ahead of a plain trash-delete of the whole directory
 * (Decision 6): the vendor almost always knows its own cache's internal
 * structure better than a directory-level delete can, and for a shared,
 * content-addressable store like pnpm's, deleting the whole thing forces a
 * full re-download for every project on the machine where the vendor's own
 * prune removes only what nothing currently references.
 *
 * `entryId` is typed as `SystemCacheEntryId`, not `string`, deliberately — a
 * typo here becomes a compile error rather than a command silently never
 * offered for a real entry.
 *
 * `cargo-cache -a` is deliberately not in this table: it needs the
 * `cargo-cache` subcommand installed separately (not part of a stock
 * `cargo`), and this catalogue does not offer a command whose own absence
 * would need a second "is it installed" probe beyond `runProcess`'s existing
 * `not-installed` outcome. Add it once `cargo-cache`'s prevalence is checked,
 * not speculatively.
 */
export type ReclaimCommand = {
  /** Which `SystemCacheEntry` this offers an alternative to. */
  entryId: SystemCacheEntryId;
  /** Shown verbatim in the confirm dialog's body — "Run brew cleanup -s". */
  label: string;
  command: string;
  /** Never built by concatenation or user input — a fixed argument vector. */
  args: readonly string[];
};

export const DEFAULT_RECLAIM_COMMANDS: readonly ReclaimCommand[] = [
  {
    entryId: 'homebrew-cache',
    label: 'Run brew cleanup -s',
    command: 'brew',
    args: ['cleanup', '-s'],
  },
  {
    entryId: 'go-build-cache',
    label: 'Run go clean -cache',
    command: 'go',
    args: ['clean', '-cache'],
  },
  {
    entryId: 'go-mod-cache',
    label: 'Run go clean -modcache',
    command: 'go',
    args: ['clean', '-modcache'],
  },
  {
    entryId: 'pnpm-store',
    label: 'Run pnpm store prune',
    command: 'pnpm',
    args: ['store', 'prune'],
  },
];
