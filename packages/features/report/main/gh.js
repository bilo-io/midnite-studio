"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shellQuote = shellQuote;
exports.isAuthenticated = isAuthenticated;
exports.describeFailure = describeFailure;
exports.createShellGh = createShellGh;
const node_child_process_1 = require("node:child_process");
const studio_shared_1 = require("@midnite/studio-shared");
const PROBE_TIMEOUT_MS = 8_000;
const PROBE_CACHE_MS = 30_000;
/** Wrap one argument for a POSIX shell: single quotes disable every expansion; `'` is closed, escaped, reopened. */
function shellQuote(argument) {
    return `'${argument.replaceAll("'", `'\\''`)}'`;
}
/** `gh auth status` exits non-zero when *any* host is signed out; a signed-in line still counts. */
function isAuthenticated(output, exitCode) {
    if (exitCode === 0)
        return true;
    return /logged in to \S+ (?:account|as)/i.test(output);
}
/** The last non-empty line that looks like an absolute path — shells print banners. */
function parseWhichOutput(output) {
    const lines = output
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('/'));
    return lines[lines.length - 1] ?? null;
}
const FAILURE_MESSAGE_MAX = 300;
/** A `gh` write failed though the CLI is ready — say which, in one line, never a JSON payload. */
function describeFailure(output) {
    const line = output
        .split('\n')
        .map((text) => text.trim())
        .filter((text) => text.length > 0 && !text.startsWith('{') && !text.startsWith('['))
        .find((text) => /error|denied|not found|could not|failed/i.test(text));
    if (line === undefined)
        return 'The GitHub CLI could not complete that request.';
    return line.length > FAILURE_MESSAGE_MAX ? `${line.slice(0, FAILURE_MESSAGE_MAX)}…` : line;
}
const loginShell = () => process.env['SHELL'] ?? (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
function runInLoginShell(command, timeoutMs) {
    return new Promise((resolvePromise) => {
        const child = (0, node_child_process_1.spawn)(loginShell(), ['-lic', command], {
            // A pager would hang until the timeout; colour codes would land in the output.
            env: (0, studio_shared_1.parseableProcessEnv)({ ...process.env, GH_PAGER: 'cat', PAGER: 'cat', NO_COLOR: '1', CLICOLOR: '0' }),
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let output = '';
        let stdout = '';
        child.stdout.on('data', (data) => {
            const text = data.toString('utf8');
            stdout += text;
            output += text;
        });
        child.stderr.on('data', (data) => {
            output += data.toString('utf8');
        });
        const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
        child.on('error', () => {
            clearTimeout(timer);
            resolvePromise({ output, stdout, exitCode: null });
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            resolvePromise({ output, stdout, exitCode: code });
        });
    });
}
/**
 * The default runner: a login shell, and a probe cached for 30 seconds — short, because
 * `gh auth login` happens in a terminal beside the app and a user who just signed in should be
 * believed without a relaunch. `run` is injectable for tests; nothing here ever reaches a real `gh`
 * under vitest (`scripts/vitest-isolate-gh.mjs`).
 */
function createShellGh(run = runInLoginShell) {
    let cache = null;
    return {
        run,
        async status() {
            const now = Date.now();
            if (cache && now - cache.at < PROBE_CACHE_MS)
                return cache.status;
            const which = await run('command -v gh', PROBE_TIMEOUT_MS);
            const binPath = which.exitCode === 0 ? parseWhichOutput(which.output) : null;
            let status;
            if (!binPath) {
                status = {
                    reason: 'not-installed',
                    binPath: null,
                    hint: 'Install the GitHub CLI — `brew install gh` — to file issues from here.',
                };
            }
            else {
                const auth = await run('gh auth status', PROBE_TIMEOUT_MS);
                status = isAuthenticated(auth.output, auth.exitCode)
                    ? { reason: 'ready', binPath, hint: '' }
                    : { reason: 'not-authenticated', binPath, hint: 'Run `gh auth login` in a terminal to file issues from here.' };
            }
            cache = { at: now, status };
            return status;
        },
    };
}
//# sourceMappingURL=gh.js.map