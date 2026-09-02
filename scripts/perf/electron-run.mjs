/**
 * Launching the packaged-equivalent app for measurement — Phase 36 Theme A.
 *
 * Shared by `startup-report.mjs` and `idle-cpu.mjs`, because both need the same
 * three awkward things right and neither should own them alone: a private
 * profile, a seeded selection, and the mark names read from the wire contract.
 *
 * Nothing here imports from the app itself. Measurement is dev-side by rule, so
 * the only coupling to the product is the env seams main already had
 * (`MSTUDIO_PERF`, `MSTUDIO_USE_BUILT_RENDERER`, `MSTUDIO_OPEN_REPOS`) and the
 * deep-link URL a user could type themselves.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..', '..');
const DESKTOP = join(REPO_ROOT, 'packages', 'desktop');
const SHARED_DIST = join(REPO_ROOT, 'packages', 'shared', 'dist', 'index.js');

/** A run that has not produced what it was waiting for by now has failed, not stalled. */
export const RUN_TIMEOUT_MS = 60_000;

/** Long enough for Chromium to commit the seeded selection to its localStorage. */
const PERSIST_FLUSH_MS = 3_000;

/** How often, and how many times, the seed re-sends its deep link. */
const SEED_NUDGE_INTERVAL_MS = 3_000;
const SEED_NUDGE_ATTEMPTS = 6;

/** `[perf] main when-ready 412` → name `when-ready`, ms `412`. */
const MARK_LINE = /\[perf\] (main|renderer) ([\w-]{1,64}) (-?\d+)/;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The mark names come from the wire contract, not from a copy in here.
 *
 * `shared` emits CommonJS (the Electron main process `require()`s it), so this
 * ESM script reaches it through `createRequire`. A restated list is the thing
 * that quietly disagrees after someone renames a mark — which is exactly the
 * failure these scripts exist to catch.
 */
export function sharedMarks() {
  if (!existsSync(SHARED_DIST)) {
    console.error(`missing ${SHARED_DIST} → moon run shared:build`);
    process.exit(2);
  }
  const require = createRequire(import.meta.url);
  const { BOOT_MARKS, RENDERER_MARKS } = require(SHARED_DIST);
  return { BOOT_MARKS, RENDERER_MARKS };
}

/** Fail with the command that fixes it, rather than with twelve missing marks. */
export function requireBuilt() {
  const missing = [
    ['packages/app/dist/index.html', 'moon run app:build'],
    ['packages/desktop/dist/bundle/main.js', 'moon run desktop:bundle'],
  ].filter(([path]) => !existsSync(join(REPO_ROOT, path)));
  if (missing.length === 0) return;
  console.error('Packaged-equivalent mode needs a built renderer and a bundled main:\n');
  for (const [path, cmd] of missing) console.error(`  missing ${path} → ${cmd}`);
  console.error('\n  moon run app:build desktop:bundle');
  process.exit(2);
}

/** The Electron binary, resolved the way packages/desktop/scripts/start-electron.mjs does. */
export function electronBinary() {
  const require = createRequire(join(DESKTOP, 'package.json'));
  return require('electron');
}

/**
 * `git rev-parse --git-common-dir` → the owning repository's root.
 *
 * Opening a linked worktree registers its MAIN worktree's path
 * (`repo-registry.ts` asks git, since a linked worktree's `.git` is a file), so
 * a deep link naming the worktree is not `known` and the renderer offers to add
 * it instead of selecting it. Running these scripts from `.worktrees/<slice>` is
 * the normal case, so this is not an edge.
 */
export function mainWorktree(path) {
  try {
    const common = execFileSync(
      'git',
      ['-C', path, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
      { encoding: 'utf8' },
    ).trim();
    return dirname(common);
  } catch {
    // Not a repository, or no git — let main reject it and say so.
    return path;
  }
}

function launchEnv(repo) {
  const env = {
    ...process.env,
    MSTUDIO_PERF: '1',
    MSTUDIO_USE_BUILT_RENDERER: '1',
    MSTUDIO_OPEN_REPOS: repo,
  };
  // Same reason as start-electron.mjs: an Electron-based editor exports this
  // into its integrated terminal and main then dies on its first `app` call.
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

/**
 * One launch against `profile`, collecting marks until `until(marks)` is true.
 *
 * Resolves with the still-running child — the caller decides when to stop it,
 * because `idle-cpu.mjs` wants to watch the process for five minutes after the
 * marks it was waiting for have arrived.
 *
 * Every run gets its own `--user-data-dir`: Electron keys
 * `requestSingleInstanceLock()` on that directory, so a launch while the
 * installed Midnite Studio.app is open otherwise quits instantly and reports
 * nothing at all. Isolation is a correctness requirement, not tidiness.
 */
export function launch({ profile, repo, until, onMark, onLine, extraArgs = [] }) {
  return new Promise((resolveRun) => {
    const child = spawn(electronBinary(), ['.', `--user-data-dir=${profile}`, ...extraArgs], {
      cwd: DESKTOP,
      env: launchEnv(repo),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const marks = new Map();
    let settled = false;
    let buffered = '';

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRun({ marks, child });
    };

    const onChunk = (chunk) => {
      buffered += chunk;
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) {
        // A generic hook past the `[perf]` mark convention — `memory-report.mjs`
        // needs Electron's own `DevTools listening on ws://…` line to attach a
        // CDP client, which is not a mark and should not become one just to be
        // observable here.
        onLine?.(line);
        const m = MARK_LINE.exec(line);
        if (!m) continue;
        // First occurrence wins: `ready-to-show` fires again after a renderer
        // reload, and a second value would silently replace the cold one.
        if (!marks.has(m[2])) {
          marks.set(m[2], Number(m[3]));
          onMark?.(m[2]);
        }
      }
      if (until(marks)) finish();
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', onChunk);
    // `defaultLogger` is `console.warn`, i.e. stderr — that is where every
    // main-process mark actually arrives.
    child.stderr.on('data', onChunk);

    const timer = setTimeout(finish, RUN_TIMEOUT_MS);
    child.on('error', (err) => {
      console.error(`failed to launch — ${err.message}`);
      finish();
    });
    child.on('exit', () => finish());
  });
}

/** Ask the running instance to select `repo`, the way clicking a link does. */
function sendDeepLink(profile, repo) {
  const child = spawn(
    electronBinary(),
    ['.', `--user-data-dir=${profile}`, `midnite-studio://open?repo=${encodeURIComponent(repo)}`],
    { cwd: DESKTOP, env: launchEnv(repo), stdio: 'ignore' },
  );
  // It hands the link over and quits on its own (the single-instance lock is
  // held by the run being measured); nothing to wait for.
  child.unref();
}

/**
 * Stop the app AND the broker it left behind.
 *
 * The pty broker is deliberately outliving the app it was spawned by — quitting
 * detaches from it rather than killing it, so background terminal sessions
 * survive a restart (`main/index.ts`'s `before-quit`). Correct for the product,
 * ruinous for a measurement loop: every run would leave another broker resident,
 * and by the tenth the machine is busy enough that boots miss their marks and
 * "idle" CPU is measuring the debris of previous runs. Ask this the way the
 * failure taught us to.
 *
 * Only processes whose argv names THIS run's throwaway profile are killed, so a
 * real Midnite Studio (or another measurement) is never touched.
 */
export async function stop(child, profile) {
  child.kill('SIGTERM');
  await sleep(2_000);
  child.kill('SIGKILL');
  if (profile) killByProfile(profile);
}

/** Kill anything still holding `profile` — the broker, and any helper that outlived it. */
function killByProfile(profile) {
  try {
    const out = execFileSync('ps', ['-Ao', 'pid=,args='], { encoding: 'utf8' });
    for (const line of out.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.includes(profile)) continue;
      const pid = Number(trimmed.split(/\s+/)[0]);
      if (!Number.isFinite(pid) || pid === process.pid) continue;
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Already gone.
      }
    }
  } catch {
    // No `ps` is not a reason to fail a measurement.
  }
}

/**
 * Create a profile that already remembers an open, selected repository.
 *
 * `graph-first-batch` only happens if a repository is SELECTED, and selection is
 * persisted state that `useDefaultSelection` deliberately does not invent (see
 * its header: it repairs a selection, it does not create one). So a brand-new
 * profile boots to "no repository selected" and the graph never streams.
 *
 * The seed opens the repo through `MSTUDIO_OPEN_REPOS` and then selects it the
 * way a user would — a deep link, delivered by a second launch against the same
 * profile, which main hands over through `second-instance`. Its timings are
 * discarded; what the measured runs inherit is a profile that remembers a
 * selection, which is what a cold start is for anyone who has used the app.
 */
export async function seedProfile(repo, required, opts = {}) {
  /*
    `os.tmpdir()`'s per-user macOS path (`/var/folders/xx/…/T`) is long enough
    that appending `/broker/<version>-<buildId>.sock` can cross the 104-byte
    `sun_path` limit `broker-client.ts` checks — a dev build's id
    (`0.1.0-<hash>-dev`) is the straw that breaks it. `memory-report.mjs`
    passes a short `tmpPrefix` for exactly this reason: its retention
    measurement needs the REAL broker, not the socket-path-too-long fallback
    to in-process ptys, which would silently measure the wrong process.
  */
  const profile = mkdtempSync(opts.tmpPrefix ?? join(tmpdir(), 'mstudio-perf-'));
  process.stderr.write('seeding profile (opens and selects the repo)…\n');

  /*
    Re-sent, not sent once. `webContents.send` is fire-and-forget: main dispatches
    the link as soon as it has a window, and a link that lands before the
    renderer's `protocol.onDeepLink` effect has subscribed is simply gone. There
    is no ack to wait for, so the seed keeps asking until the graph proves
    someone heard.
  */
  let nudger = null;
  const run = await launch({
    profile,
    repo,
    until: (marks) => required.every((name) => marks.has(name)),
    onMark: (name) => {
      if (name !== 'first-view-rendered' || nudger) return;
      let attempts = 0;
      const nudge = () => {
        attempts += 1;
        sendDeepLink(profile, repo);
        if (attempts >= SEED_NUDGE_ATTEMPTS) clearInterval(nudger);
      };
      nudge();
      nudger = setInterval(nudge, SEED_NUDGE_INTERVAL_MS);
    },
  });
  if (nudger) clearInterval(nudger);

  if (!run.marks.has('graph-first-batch')) {
    console.error(
      'seed run never streamed a graph — the deep link did not select the repo.\n' +
        `  repo: ${repo}\n` +
        '  Check that the path is a repository main can open (see MSTUDIO_OPEN_REPOS).',
    );
    await stop(run.child, profile);
    discardProfile(profile);
    process.exit(2);
  }

  // Give Chromium time to write the selection to localStorage before the process
  // goes away; every measured run depends on it being there.
  await sleep(PERSIST_FLUSH_MS);
  await stop(run.child, profile);
  return profile;
}

export function discardProfile(profile) {
  // `force` does not help with ENOTEMPTY: a broker killed a moment ago can still
  // be mid-write into the directory. One retry is enough, and a leftover temp
  // profile is noise rather than a reason to lose the numbers.
  for (const attempt of [0, 1]) {
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      return;
    } catch {
      if (attempt === 1) return;
    }
  }
}

export const median = (nums) => {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

/** Parse `--name=value` / `--flag` argv, the only CLI convention these scripts need. */
export function cli(argv) {
  return {
    flag: (name) => argv.includes(`--${name}`),
    value: (name, fallback) => {
      const hit = argv.find((a) => a.startsWith(`--${name}=`));
      return hit ? hit.slice(name.length + 3) : fallback;
    },
  };
}
