/**
 * Stands in for `dugite` in Agents' bundle (`scripts/bundle-main.mjs` aliases it here).
 *
 * The chats feature reaches git through `@midnite/studio-git-engine`, which wraps dugite's bundled git
 * binary. Agents does not ship that binary yet, and has no repository registry either, so every chat
 * runs in its scratch directory and nothing reaches this stub. If a path ever does, it fails with a
 * sentence the chat page renders instead of a native-module load error.
 */
const UNAVAILABLE = 'Midnite Agents does not bundle git yet — chats on a repository arrive with the Coder app.';

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
