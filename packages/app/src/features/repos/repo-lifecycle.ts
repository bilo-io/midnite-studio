import { bridge } from '../../services/bridge';
import { useTerminalStore } from '../terminal/terminal-store';
import { useUiStore } from '../../store/ui-store';

export type LifecycleAction = 'install' | 'build' | 'test' | 'launch';

const LIFECYCLE_LABEL: Record<LifecycleAction, string> = {
  install: 'Install',
  build: 'Build',
  test: 'Test',
  launch: 'Launch',
};

type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm';

/** Checked in listing order — a repo carrying two lockfiles is rare enough that the first match wins. */
const LOCKFILE_MANAGER: readonly [string, PackageManager][] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['pnpm-workspace.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
];

/**
 * Root-directory heuristics for one repository checkout.
 *
 * Read-only (`fs.listDir`/`fs.readFile`, the same jailed, no-write surface the
 * Files view uses), and best-effort throughout: every failure degrades to a
 * plain `npm` guess rather than throwing, because the four buttons that call
 * this only TYPE the result into a terminal — see `runLifecycleAction` — so a
 * wrong guess costs an edit, not a mistaken run.
 */
async function inspectRepoRoot(
  repoId: string,
  worktreePath: string | undefined,
): Promise<{ moon: boolean; pm: PackageManager; scripts: Record<string, string> }> {
  const api = bridge();
  const fallback = { moon: false, pm: 'npm' as PackageManager, scripts: {} };
  if (!api) return fallback;

  const scope = { scope: 'repo' as const, repoId, ...(worktreePath ? { worktreePath } : {}) };
  const [dir, pkg] = await Promise.all([
    api.fs.listDir({ ...scope, relPath: '' }),
    api.fs.readFile({ ...scope, relPath: 'package.json' }),
  ]);

  const names = dir.ok ? new Set(dir.entries.map((entry) => entry.name)) : new Set<string>();
  const moon = names.has('.moon');
  const pm = LOCKFILE_MANAGER.find(([lockfile]) => names.has(lockfile))?.[1] ?? 'npm';

  let scripts: Record<string, string> = {};
  if (pkg.kind === 'text') {
    try {
      const parsed: unknown = JSON.parse(pkg.content);
      const candidate =
        parsed && typeof parsed === 'object' ? (parsed as { scripts?: unknown }).scripts : null;
      if (candidate && typeof candidate === 'object') {
        scripts = candidate as Record<string, string>;
      }
    } catch {
      // Not valid JSON, or not readable as such — the npm/yarn/pnpm fallback
      // below covers a repo whose scripts this could not learn.
    }
  }

  return { moon, pm, scripts };
}

/** `npm` alone doesn't run a script by bare name; every other manager does. */
const runScript = (pm: PackageManager, script: string): string =>
  pm === 'npm' ? `npm run ${script}` : `${pm} run ${script}`;

function commandFor(
  action: LifecycleAction,
  info: { moon: boolean; pm: PackageManager; scripts: Record<string, string> },
): string {
  const { moon, pm, scripts } = info;

  if (action === 'install') return `${pm} install`;
  // A moon workspace's own scripts (this repo's `:typecheck`/`:build` targets)
  // are project-level, not repo-root ones — `package.json` at the root has
  // nothing to say about them, so moon takes over from here regardless of
  // what scripts.json holds.
  if (moon) return action === 'build' ? 'moon run :build' : `moon run :${action}`;
  if (action === 'build') return runScript(pm, 'build');
  if (action === 'test') return runScript(pm, 'test');

  // Launch: whichever of the conventional dev-server script names exists,
  // preferring the one most likely to be a long-running watcher.
  const script = ['dev', 'start', 'preview'].find((name) => scripts[name]) ?? 'start';
  return runScript(pm, script);
}

/**
 * Open a shell on a repository's checkout with a guessed install/build/test/
 * launch command typed at the prompt — and NOT run, the same posture every
 * other terminal-opening action in this app takes (`start-claude.ts`,
 * `run-in-terminal.ts`): the command is a guess from the checkout's own
 * files, and the user's own Return is what decides whether it runs.
 */
export async function runLifecycleAction(
  action: LifecycleAction,
  target: { repoId: string; repoName: string; cwd: string; worktreePath?: string },
): Promise<void> {
  const info = await inspectRepoRoot(target.repoId, target.worktreePath);
  const command = commandFor(action, info);

  useUiStore.getState().setTerminalOpen(true);
  const session = useTerminalStore.getState().openSession({
    kind: 'shell',
    title: target.repoName,
    name: LIFECYCLE_LABEL[action],
    cwd: target.cwd,
    repoId: target.repoId,
  });
  useTerminalStore.getState().queueInput(session.id, command);
}
