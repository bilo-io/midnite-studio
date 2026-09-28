import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  LuChevronLeft,
  LuCloudDownload,
  LuFolder,
  LuX,
} from 'react-icons/lu';

import type { ForgeAccount, ReachableRepo } from '@midnite/studio-shared';

import { AccountSwitcher } from '../../components/account-switcher';
import { openAccountsSettings } from '../../components/account-switcher-store';
import { IconButton } from '../../components/icon-button';
import { Modal } from '../../components/modal';
import { bridge } from '../../services/bridge';
import {
  useCloneReachableRepo,
  useForgeAccounts,
  usePickAndOpenRepo,
  useReachableRepos,
  useRepos,
} from '../../services/queries';
import { useUiStore } from '../../store/ui-store';
import {
  PROVIDER_ICON,
  PROVIDER_LABEL,
  type SupportedKind,
} from '../settings/settings-pages/accounts-page';
import { ReachableRepoRow } from '../settings/settings-pages/reachable-repo-row';

/**
 * The parent directory the last successful clone landed in this session.
 *
 * Deliberately session-only, not a `ui-store.ts` persisted preference:
 * `persisted-keys.ts` requires every stored preference to be named under a
 * real settings page (`persisted-keys.test.ts` enforces it), and this value
 * has no settings surface of its own — it exists purely to make the SECOND
 * clone in a sitting default to where the FIRST one went. `useRepos`'s own
 * list is the fallback once this is empty again (a fresh launch, or before
 * any clone has happened yet).
 */
let lastCloneParentDir: string | null = null;

/** Test-only: `add-repo-modal.test.tsx` resets this between cases so one
 *  test's clone destination can't leak into the next. */
export function __resetAddRepoModalStateForTests(): void {
  lastCloneParentDir = null;
}

/** The directory a path sits in — a plain string split rather than
 *  `node:path.dirname`, which `packages/app` may not import (CLAUDE.md's
 *  package boundary: the renderer never touches Node builtins). macOS is the
 *  only supported platform, so a POSIX-only split is exhaustive here. */
function parentDirOf(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  const slash = trimmed.lastIndexOf('/');
  return slash > 0 ? trimmed.slice(0, slash) : trimmed;
}

/** The destination step's starting guess: the last dir a clone in this
 *  session landed in, else the parent of whichever repo is first in the
 *  registry, else `null` (nothing to suggest — the user picks cold). */
function useDefaultCloneParentDir(): string | null {
  const { data: repos = [] } = useRepos();
  if (lastCloneParentDir) return lastCloneParentDir;
  return repos[0] ? parentDirOf(repos[0].path) : null;
}

type Step = 'choose' | 'clone-list' | 'clone-destination';

const TILE_CLASS =
  'flex flex-col items-center gap-2 rounded-lg border border-border p-4 text-center transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50';

/**
 * The "+" toolbar button's modal (ad hoc task — not a `.midnite/tasks/`
 * phase): a first stop before either opening a local folder or cloning one
 * of the active forge account's repos, where today's toolbar button went
 * straight to the native folder picker.
 *
 * Reuses every piece Phase 90 Theme C already built rather than duplicating
 * it: `useReachableRepos`/`ReachableRepoRow` (the same listing and row
 * Settings ▸ Accounts ▸ Reachable repositories renders), `useCloneReachableRepo`'s
 * underlying mutation (`repos.clone` IPC — write-queue-free clone, then
 * `GitOpResult`-free `RepoOpenResponse`-shaped open, exactly as
 * `repo-handlers.ts`'s `repoClone` handler already does), and `AccountSwitcher`
 * for "switch accounts here too" instead of a second switcher.
 *
 * Progress and errors render inside the modal for both tiles — the clone
 * path per the task's own ask, and the local-open path for consistency now
 * that "Open a repository…" lives behind this dialog rather than the bare
 * toolbar button (previously its error surfaced in the panel's own error
 * line; `repos-panel.tsx` still owns that line for every OTHER op).
 */
export function AddRepoModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>('choose');
  const [selectedRepo, setSelectedRepo] = useState<ReachableRepo | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const { data: accounts = [] } = useForgeAccounts();
  const activeId = useUiStore((s) => s.forgeActiveAccountId);
  const activeAccount = accounts.find((a) => a.id === activeId) ?? accounts[0] ?? null;

  const { pickAndOpen, isPending: opening } = usePickAndOpenRepo();

  const closeAll = () => {
    setStep('choose');
    setSelectedRepo(null);
    setLocalError(null);
    onClose();
  };

  const handleLocal = () => {
    setLocalError(null);
    void (async () => {
      const result = await pickAndOpen();
      if (result === null) return; // Cancelled the native dialog — stay put.
      if (!result.ok) {
        setLocalError(result.message);
        return;
      }
      closeAll();
    })();
  };

  const kind = activeAccount ? (activeAccount.kind as SupportedKind) : null;
  const CloneIcon = kind ? (PROVIDER_ICON[kind] ?? LuCloudDownload) : LuCloudDownload;
  const cloneLabel = kind ? (PROVIDER_LABEL[kind] ?? activeAccount!.kind) : null;

  // `ReposPanel` (this component's only mount point) lives inside `app.tsx`'s
  // sliding `<aside>` — its own `overflow-hidden` plus the slide tween's
  // `transform` make that aside the containing block for a `position: fixed`
  // descendant (per the CSS transform spec), which both clips the modal to
  // the sidebar's width and drops it behind the graph pane's `role="grid"`
  // scroller in hit-test order despite `Modal`'s own `z-dialog`. Portalling to
  // `document.body` is the standard escape — the modal is fixed to the real
  // viewport again, and every other panel's stacking context is irrelevant.
  return createPortal(
    <Modal open onClose={closeAll} title="Add a repository" size="md" testId="add-repo-modal">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold">Add a repository</h2>
        <IconButton icon={LuX} label="Close" size="sm" onClick={closeAll} />
      </div>

      {step === 'choose' ? (
        <div className="flex flex-col gap-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setStep('clone-list')} className={TILE_CLASS}>
              <CloneIcon aria-hidden className="h-8 w-8" />
              <span className="text-sm font-medium">Clone a repo</span>
              <span className="text-[11px] text-muted-foreground">
                {cloneLabel
                  ? `from ${cloneLabel} · ${activeAccount!.displayName || activeAccount!.login}`
                  : 'from GitHub, GitLab, Bitbucket or Azure DevOps'}
              </span>
            </button>
            <button
              type="button"
              onClick={handleLocal}
              disabled={opening}
              className={TILE_CLASS}
            >
              <LuFolder aria-hidden className="h-8 w-8" />
              <span className="text-sm font-medium">Local repo</span>
              <span className="text-[11px] text-muted-foreground">
                {opening ? 'Opening…' : 'Open a folder already on disk'}
              </span>
            </button>
          </div>
          {localError ? (
            <p role="alert" className="text-[11px] text-red-500">
              {localError}
            </p>
          ) : null}
        </div>
      ) : step === 'clone-list' ? (
        <CloneListStep
          accounts={accounts}
          activeAccount={activeAccount}
          onBack={() => setStep('choose')}
          onPick={(repo) => {
            setSelectedRepo(repo);
            setStep('clone-destination');
          }}
          onConnectForge={closeAll}
        />
      ) : selectedRepo ? (
        <CloneDestinationStep
          repo={selectedRepo}
          onBack={() => setStep('clone-list')}
          onDone={closeAll}
        />
      ) : null}
    </Modal>,
    document.body,
  );
}

function BackButton({ onBack, disabled }: { onBack: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onBack}
      disabled={disabled}
      className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
    >
      <LuChevronLeft aria-hidden className="h-3 w-3" />
      Back
    </button>
  );
}

/**
 * Step 2 of the clone path: the active account's forge, an account switcher
 * beside it, and its reachable-repos listing — the same three states
 * `ReachableReposSection` (Settings ▸ Accounts) already renders for
 * "unsupported kind" / a provider error / an empty account, so a user who has
 * seen that page sees nothing new here.
 */
function CloneListStep({
  accounts,
  activeAccount,
  onBack,
  onPick,
  onConnectForge,
}: {
  accounts: readonly ForgeAccount[];
  activeAccount: ForgeAccount | null;
  onBack: () => void;
  onPick: (repo: ReachableRepo) => void;
  onConnectForge: () => void;
}) {
  if (accounts.length === 0) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <BackButton onBack={onBack} />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          No forge account connected yet. Connect GitHub, GitLab, Bitbucket or Azure DevOps in
          Settings to clone one of its repositories.
        </p>
        <button
          type="button"
          onClick={() => {
            openAccountsSettings({ focusAddForm: true });
            onConnectForge();
          }}
          className="h-7 w-fit rounded-md border border-border px-3 text-xs font-medium transition-colors hover:bg-accent"
        >
          Connect a forge account…
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <BackButton onBack={onBack} />
        <AccountSwitcher layout="titlebar" />
      </div>
      {activeAccount ? (
        <ReachableList account={activeAccount} onPick={onPick} />
      ) : (
        <p className="text-[11px] text-muted-foreground">No account selected.</p>
      )}
    </div>
  );
}

function ReachableList({
  account,
  onPick,
}: {
  account: ForgeAccount;
  onPick: (repo: ReachableRepo) => void;
}) {
  const { data: result, isLoading } = useReachableRepos(account.id);
  const kind = account.kind as SupportedKind;
  const providerIcon = PROVIDER_ICON[kind] ?? LuCloudDownload;
  const providerLabel = PROVIDER_LABEL[kind] ?? account.kind;

  if (isLoading) {
    return <p className="text-[11px] text-muted-foreground">Loading…</p>;
  }
  if (!result || !result.ok) {
    return (
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {!result || result.reason === 'unsupported'
          ? `Reachable-repo listing isn't available for ${providerLabel} yet.`
          : (result.message ?? 'Could not load this account’s repositories.')}
      </p>
    );
  }
  if (result.repos.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">No repositories found for {account.login}.</p>
    );
  }

  return (
    <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
      {result.repos.map((repo) => (
        <ReachableRepoRow
          key={repo.fullName}
          repo={repo}
          providerIcon={providerIcon}
          providerLabel={providerLabel}
        >
          <button
            type="button"
            onClick={() => onPick(repo)}
            className="h-6 shrink-0 rounded-md border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent"
          >
            Clone…
          </button>
        </ReachableRepoRow>
      ))}
    </div>
  );
}

/**
 * Step 3: where to put it. Defaults to a guessed parent directory
 * (`useDefaultCloneParentDir`) and shows the resulting full path before
 * anything is written to disk; "Choose a different folder…" opens the same
 * native picker `pickAndClone` used to always open unconditionally.
 */
function CloneDestinationStep({
  repo,
  onBack,
  onDone,
}: {
  repo: ReachableRepo;
  onBack: () => void;
  onDone: () => void;
}) {
  // `useRepos()` (inside `useDefaultCloneParentDir`) hasn't necessarily
  // resolved yet on the render that mounts this step — deriving `parentDir`
  // from the two rather than freezing it into `useState`'s initializer is
  // what lets the guessed default appear the moment that query settles,
  // without a `useEffect` that would just as easily go stale. `chosenDir`
  // only ever holds an EXPLICIT pick, so it — and only it — survives the
  // default recomputing under it.
  const defaultParent = useDefaultCloneParentDir();
  const [chosenDir, setChosenDir] = useState<string | null>(null);
  const parentDir = chosenDir ?? defaultParent;
  const [error, setError] = useState<string | null>(null);
  const clone = useCloneReachableRepo();

  const choose = async () => {
    const dir = await bridge()?.repos.pickDirectory();
    if (dir) setChosenDir(dir);
  };

  const confirm = async () => {
    if (!parentDir) return;
    setError(null);
    const result = await clone.mutateAsync({ destDir: parentDir, url: repo.url, name: repo.name });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    lastCloneParentDir = parentDir;
    onDone();
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <BackButton onBack={onBack} disabled={clone.isPending} />
      <p className="text-xs text-muted-foreground">
        Clone <span className="font-medium text-foreground">{repo.fullName}</span> to:
      </p>
      {parentDir ? (
        <p
          data-testid="clone-destination-path"
          className="truncate rounded-md border border-border/60 bg-card/50 px-2 py-1.5 font-mono text-[11px]"
        >
          {parentDir}/{repo.name}
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">Choose a folder to clone into.</p>
      )}
      {error ? (
        <p role="alert" className="text-[11px] text-red-500">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void choose()}
          disabled={clone.isPending}
          className="h-7 rounded-md border border-border px-3 text-xs font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {parentDir ? 'Choose a different folder…' : 'Choose a folder…'}
        </button>
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={!parentDir || clone.isPending}
          className="h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {clone.isPending ? 'Cloning…' : 'Clone'}
        </button>
      </div>
    </div>
  );
}
