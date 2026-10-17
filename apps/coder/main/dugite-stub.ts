/**
 * Stands in for `dugite` in Coder's bundle (`scripts/bundle-main.mjs` aliases it here).
 *
 * Coder ships no git binary (docs/APPS.md, "Coder"): a repository's forge comes from its `.git/config`,
 * read as a file, and the forge and tests features reach git-engine only for pure parsers (diff and
 * remote parsing, test discovery over the filesystem). If a path ever does reach git, it fails with a
 * sentence the view renders instead of a native-module load error.
 */
const UNAVAILABLE = 'Midnite Coder does not bundle git — this needs Midnite Studio.';

export const GitProcess = {
  exec: async (): Promise<{ exitCode: number; stdout: string; stderr: string }> => ({
    exitCode: 128,
    stdout: '',
    stderr: UNAVAILABLE,
  }),
  spawn: (): never => {
    throw new Error(UNAVAILABLE);
  },
};
