// Moved to the runtime layer (Phase 113 Theme Q), beside `process-runner` — the Video feature's
// toolchain probe resolves `node`/`npx` through the user's login shell. Re-exported so importers are unchanged.
export { loginShell, parseWhichOutput, runInShell, type ShellRun } from '@midnite/studio-runtime';
