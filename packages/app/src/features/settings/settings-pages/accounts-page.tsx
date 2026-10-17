import { SettingsAccordion } from '../settings-section';
import { useEffect, useRef, useState } from 'react';
import { LuArrowRightLeft, LuCircleUserRound, LuCloudDownload, LuInfo, LuPlus } from 'react-icons/lu';

import {
  ForgeAccountAddForm,
  ForgeAccountRemoveButton,
  ForgeCredentialsNote,
} from '@midnite/studio-feature-vault/renderer';
import type { ForgeAccount, ReachableRepo } from '@midnite/studio-shared';

import { useAccountSwitcherStore } from '../../../components/account-switcher-store';
import { SettingsSwitchRow } from '../../../components/form/settings-switch-row';
import { UserAvatar } from '../../../components/user-avatar';
import {
  useCloneReachableRepo,
  useForgeAccounts,
  useReachableRepos,
  useSwitchForgeAccount,
} from '../../../services/queries';
import {
  FORGE_SWITCHER_PLACEMENTS,
  useUiStore,
  type ForgeSwitcherPlacement,
} from '../../../store/ui-store';
import { useSetupStore } from '../../setup/setup-store';
import { Field } from './controls';
import { PROVIDER_ICON, PROVIDER_LABEL, type SupportedKind } from './forge-providers';
import { ReachableRepoActions } from './reachable-repo-actions';
import { ReachableRepoRow } from './reachable-repo-row';

/**
 * Settings ▸ Accounts (Phase 90 Theme B) — the "who am I" page this app has
 * never had. One row per stored account, an active marker, add/remove, and a
 * PAT field per new provider with its exact scopes spelled out.
 *
 * This is `forgeAccounts` and `forgeActiveAccountId`'s home in `ui-store.ts`
 * — `persisted-keys.ts` requires every preference to be named under a real
 * settings page, and this is it.
 *
 * No self-hosted host field and no OAuth button — see the phase doc's own
 * Decisions: a pasted PAT is the credential for all three new providers, and
 * `gitlab.com`/`bitbucket.org`/`dev.azure.com` are the only hosts this phase
 * supports.
 *
 * **The credential half is the vault feature's** (Phase 113 Theme J slice 3):
 * the add form, each row's remove button and the "How this works" note are
 * `@midnite/studio-feature-vault/renderer` components, rendered here through
 * composition over Studio's vault host (`compose/vault-host.tsx`, which lends
 * them `forge-providers.ts` and the forge-account mutations). What stays is
 * forge's: the active account, switching preferences, reachable repos.
 */
export function AccountsPage() {
  const { data: accounts = [] } = useForgeAccounts();
  const switchAccount = useSwitchForgeAccount();

  const activeId = useUiStore((s) => s.forgeActiveAccountId);
  const activeAccount = accounts.find((a) => a.id === activeId) ?? null;
  const scopeReposToActiveAccount = useUiStore((s) => s.forgeScopeReposToActiveAccount);
  const setScopeReposToActiveAccount = useUiStore((s) => s.setForgeScopeReposToActiveAccount);
  const switcherPlacement = useUiStore((s) => s.forgeSwitcherPlacement);
  const setSwitcherPlacement = useUiStore((s) => s.setForgeSwitcherPlacement);
  const syncGhAuthSwitch = useUiStore((s) => s.forgeSyncGhAuthSwitch);
  const setSyncGhAuthSwitch = useUiStore((s) => s.setForgeSyncGhAuthSwitch);
  /*
    The setup overlay's "Connect your forges" page (Phase 98 Theme A,
    `setup-pages.ts`'s `id: 'forges'`) records itself here on Skip. A literal
    id rather than an import of `SETUP_PAGES`: that module already imports
    this file, so importing it back would be a cycle for one string.
    `setup-store.ts` imports nothing, so "Resume setup" is free.
  */
  const skippedForgeStep = useUiStore((s) => s.setupState.skippedPageIds.includes('forges'));
  const clearSkippedForgeStep = useUiStore((s) => s.setSetupPageSkipped);
  const openSetup = useSetupStore((s) => s.openSetup);

  /*
    The account switcher's "Add account…" (Phase 90 Theme L) lands here with
    the add form focused: a pending request, consumed on sight — usually made
    from another view, before this page mounted. Focus goes to the selected
    provider, the form's first control, and the form scrolls into view.
  */
  const addFormRef = useRef<HTMLFormElement>(null);
  const addFormPending = useAccountSwitcherStore((s) => s.addFormPending);
  const consumeAddForm = useAccountSwitcherStore((s) => s.consumeAddForm);
  useEffect(() => {
    if (!addFormPending) return;
    consumeAddForm();
    const form = addFormRef.current;
    if (!form) return;
    form.scrollIntoView?.({ block: 'nearest' });
    form
      .querySelector<HTMLElement>('[role="radio"][aria-checked="true"], input, button')
      ?.focus({ preventScroll: true });
  }, [addFormPending, consumeAddForm]);

  return (
    <div className="flex flex-col gap-3">
      {skippedForgeStep ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          <span>You skipped connecting a forge during setup — add one below whenever you're ready.</span>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => openSetup('forges')}
              className="rounded px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
            >
              Resume setup
            </button>
            <button
              type="button"
              onClick={() => clearSkippedForgeStep('forges', false)}
              className="rounded px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}
      <SettingsAccordion title="Accounts" icon={<LuCircleUserRound className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-2 p-3">
          {accounts.length === 0 ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              No accounts yet. GitHub reads through this app's existing `gh` sign-in with no setup
              here — add one below only for a second GitHub identity, or for GitLab, Bitbucket or
              Azure DevOps.
            </p>
          ) : (
            accounts.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                active={account.id === activeId}
                onMakeActive={() => switchAccount.mutate(account.id)}
              />
            ))
          )}
        </div>
      </SettingsAccordion>

      <SettingsAccordion title="Add an account" icon={<LuPlus className="h-4 w-4" />} defaultOpen>
        <ForgeAccountAddForm formRef={addFormRef} />
      </SettingsAccordion>

      <SettingsAccordion
        title="Account switching"
        icon={<LuArrowRightLeft className="h-4 w-4" />}
        defaultOpen
      >
        <div className="flex flex-col gap-3 p-3">
          <Field
            label="Account switcher"
            hint="Where the account switcher sits. Hidden removes it from the window; the command palette's “Switch Forge Account…” then opens this page instead."
          >
            <select
              value={switcherPlacement}
              onChange={(event) =>
                setSwitcherPlacement(event.target.value as ForgeSwitcherPlacement)
              }
              aria-label="Account switcher placement"
              className="w-full rounded-md border border-input bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
            >
              {FORGE_SWITCHER_PLACEMENTS.map((placement) => (
                <option key={placement} value={placement}>
                  {SWITCHER_PLACEMENT_LABEL[placement]}
                </option>
              ))}
            </select>
          </Field>
          <SettingsSwitchRow
            id="scope-repos-to-active-account"
            label="Hide repos that don't belong to the active account"
            description="When on, an open repo whose remote doesn't belong to the active account is hidden from the sidebar rather than closed — switch back and it reappears exactly as you left it."
            on={scopeReposToActiveAccount}
            onToggle={(_id, next) => setScopeReposToActiveAccount(next)}
          />
          <SettingsSwitchRow
            id="sync-gh-auth-switch"
            label="Run `gh auth switch` when the active GitHub account changes"
            description="Switching to a GitHub account also runs `gh auth switch` in a shell beside the app, so every `gh` invocation on this machine — including in your own terminal — follows the same identity. Off leaves your terminal's `gh` session untouched."
            on={syncGhAuthSwitch}
            onToggle={(_id, next) => setSyncGhAuthSwitch(next)}
          />
        </div>
      </SettingsAccordion>

      {activeAccount ? <ReachableReposSection account={activeAccount} /> : null}

      <SettingsAccordion title="How this works" icon={<LuInfo className="h-4 w-4" />}>
        <ForgeCredentialsNote />
      </SettingsAccordion>
    </div>
  );
}

const SWITCHER_PLACEMENT_LABEL: Record<ForgeSwitcherPlacement, string> = {
  'titlebar-right': 'Title bar — right, beside the theme toggle',
  'titlebar-left': 'Title bar — left, after back/forward and reload',
  'rail-top': 'Sidebar — top, under the logo',
  'rail-bottom': 'Sidebar — bottom, above the lock button',
  hidden: 'Hidden',
};

function AccountRow({
  account,
  active,
  onMakeActive,
}: {
  account: ForgeAccount;
  active: boolean;
  onMakeActive: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-card/50 px-2 py-1.5">
      <UserAvatar login={account.login} name={account.displayName} src={account.avatarUrl} size={20} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{account.displayName || account.login}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {account.kind} · {account.host}
          {account.delegated === 'gh' ? ' · via gh' : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={onMakeActive}
        aria-pressed={active}
        className={`h-6 shrink-0 rounded-md border px-2 text-[11px] transition-colors ${
          active
            ? 'border-primary bg-primary/10 text-foreground'
            : 'border-border text-muted-foreground hover:bg-accent'
        }`}
      >
        {active ? 'Active' : 'Make active'}
      </button>
      <ForgeAccountRemoveButton account={account} />
    </div>
  );
}

/**
 * "Repositories I can reach" for the active account (Phase 90 Theme C) — a
 * listing, not an auto-clone: nothing lands on disk until the user picks a
 * destination via the native folder dialog `useCloneReachableRepo` opens.
 *
 * `unsupported` (a kind whose `capabilitiesFor(kind).repoListing` is
 * `'none'` — none of the four supported providers today) reads plainly
 * rather than as an empty list: this page never pretends a listing it cannot
 * produce.
 */
function ReachableReposSection({ account }: { account: ForgeAccount }) {
  const { data: result, isLoading } = useReachableRepos(account.id);
  const { pickAndClone, isPending } = useCloneReachableRepo();
  const [cloningFullName, setCloningFullName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clone = async (repo: ReachableRepo) => {
    setError(null);
    setCloningFullName(repo.fullName);
    const outcome = await pickAndClone(repo.url, repo.name);
    setCloningFullName(null);
    if (outcome && !outcome.ok) setError(outcome.message);
  };

  return (
    <SettingsAccordion
      title="Reachable repositories"
      icon={<LuCloudDownload className="h-4 w-4" />}
    >
      <div className="flex flex-col gap-2 p-3">
        {isLoading ? (
          <p className="text-[11px] text-muted-foreground">Loading…</p>
        ) : !result || !result.ok ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {!result || result.reason === 'unsupported'
              ? `Reachable-repo listing isn't available for ${PROVIDER_LABEL[account.kind as SupportedKind] ?? account.kind} yet.`
              : (result.message ?? 'Could not load this account’s repositories.')}
          </p>
        ) : result.repos.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No repositories found for {account.login}.
          </p>
        ) : (
          result.repos.map((repo) => (
            <ReachableRepoRow
              key={repo.fullName}
              repo={repo}
              providerIcon={PROVIDER_ICON[account.kind as SupportedKind] ?? LuCloudDownload}
              providerLabel={PROVIDER_LABEL[account.kind as SupportedKind] ?? account.kind}
            >
              <button
                type="button"
                onClick={() => void clone(repo)}
                disabled={isPending && cloningFullName === repo.fullName}
                className="h-6 shrink-0 rounded-md border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending && cloningFullName === repo.fullName ? 'Cloning…' : 'Clone…'}
              </button>
              <ReachableRepoActions account={account} repo={repo} />
            </ReachableRepoRow>
          ))
        )}
        {error ? (
          <p role="alert" className="text-[11px] text-red-500">
            {error}
          </p>
        ) : null}
      </div>
    </SettingsAccordion>
  );
}
