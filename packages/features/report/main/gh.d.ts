import { type ForgeCliStatus } from '@midnite/studio-shared';
/**
 * How the report feature reaches `gh` — a port, so an app's main can share its own.
 *
 * Studio already probes `gh` for the forge (`features/forge/main/github/gh-shell.ts`), with a
 * 30-second cache every forge surface reads; it hands that probe and that shell in, so the dialog
 * and the forge sidebar can never disagree about whether `gh` is signed in. An app with no forge of
 * its own takes {@link createShellGh}: the same login shell, the same pager-and-colour environment
 * and the same never-reject contract, written once more here because a feature may not import
 * another feature.
 */
export type GhRunResult = {
    output: string;
    stdout: string;
    exitCode: number | null;
};
export type GhRunner = {
    /** Is `gh` installed, and does it hold a credential? */
    status(): Promise<ForgeCliStatus>;
    /** Run one command line in a login shell. Never rejects. */
    run(command: string, timeoutMs: number): Promise<GhRunResult>;
};
/** Wrap one argument for a POSIX shell: single quotes disable every expansion; `'` is closed, escaped, reopened. */
export declare function shellQuote(argument: string): string;
/** `gh auth status` exits non-zero when *any* host is signed out; a signed-in line still counts. */
export declare function isAuthenticated(output: string, exitCode: number | null): boolean;
/** A `gh` write failed though the CLI is ready — say which, in one line, never a JSON payload. */
export declare function describeFailure(output: string): string;
/**
 * The default runner: a login shell, and a probe cached for 30 seconds — short, because
 * `gh auth login` happens in a terminal beside the app and a user who just signed in should be
 * believed without a relaunch. `run` is injectable for tests; nothing here ever reaches a real `gh`
 * under vitest (`scripts/vitest-isolate-gh.mjs`).
 */
export declare function createShellGh(run?: GhRunner['run']): GhRunner;
//# sourceMappingURL=gh.d.ts.map