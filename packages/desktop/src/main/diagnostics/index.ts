/**
 * Repository diagnostics — and the trust boundary they sit behind.
 *
 * ## The policy
 *
 * **Repo-local binaries execute only for repositories the user has explicitly
 * trusted, and the prompt names the command.**
 *
 * This module is the first place Midnite Studio runs a program that belongs to the
 * repository rather than to us. Everything else that spawns is one of three
 * things: the bundled git, a binary found on the PATH a login shell builds
 * (`gh`, `claude`), or the user's own shell at their explicit request in the
 * terminal panel. Each of those is a program the *user* installed, on a machine
 * they control, doing a job they asked for.
 *
 * `node_modules/.bin/eslint` is none of those. It arrives with the repository.
 * Opening a folder to look at its history is not consent to execute code out of
 * it, and a git client that quietly ran a checked-in binary the moment you
 * added a repo would be a supply-chain delivery mechanism with a graph view.
 *
 * So the rules, stated rather than left implicit in a commit message — the same
 * treatment the fs jail gets in `channels.ts`:
 *
 * 1. **Opt in per repository.** Never per app, never a global "allow
 *    diagnostics" setting. Trusting one repo says nothing about the next.
 * 2. **The grant names the command.** It is recorded against a fingerprint of
 *    the exact executable and argument vector (`commandFingerprint`). Change
 *    the configured command and the grant stops applying — because the sentence
 *    the user agreed to had the old command in it. A grant that survived an
 *    edit would let a repo escalate by rewriting its own config.
 * 3. **Main never takes the renderer's word for what to run.** The channels
 *    carry a `repoId` and nothing else; the working directory comes from
 *    `resolveWorkdir`, and the command comes from this module's own store. The
 *    single exception is `trust`, where the command is the thing being
 *    approved — and it is checked against what detection actually proposed
 *    before it is stored.
 * 4. **Propose, never invent.** Detection offers what it can prove is there,
 *    with the evidence that made it fire. A repository with no recognised
 *    tooling offers nothing; it does not get a guess.
 * 5. **Arguments, not a shell.** The runner spawns an argument vector with no
 *    shell anywhere in it. `gh-cli.ts` needs a login shell because a Homebrew
 *    binary exists only on a shell's PATH; a path we resolved on disk ourselves
 *    needs no such thing, and the shell it avoids is the whole attack surface
 *    of quoting a filename an attacker chose.
 * 6. **Never on a timer, never on a file change.** Runs are manual. The watcher
 *    fires on every keystroke-save, and "lint on save" would turn a trust grant
 *    into continuous background execution the user stopped thinking about.
 * 7. **Fail soft, always.** Every failure is a reason code the footer renders.
 *    Nothing here throws across the IPC boundary.
 *
 * ## The pieces
 *
 * - `trust-store.ts` — grants and per-repo command config, persisted
 * - `detect.ts` — the detector registry: proposes, never invents
 * - `parse-eslint.ts` — a total, streaming parser over `eslint --format json`
 * - `runner.ts` — spawn, deadline, stream into a parser
 */

export { createTrustStore, nullTrustStore, parseTrustState, type TrustStore } from './trust-store';
export { detectCandidates, DETECTORS, type Detector, type DetectFs } from './detect';
export { createEslintStream, type DiagnosticsSink } from './parse-eslint';
export { runDiagnostics, type SpawnFn, type RunnerDeps } from './runner';
