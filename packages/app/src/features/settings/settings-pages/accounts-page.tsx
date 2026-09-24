import { Accordion } from '@bilo-io/ui';
import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  LuArrowRightLeft,
  LuCircleUserRound,
  LuCloudDownload,
  LuInfo,
  LuPlus,
  LuTrash2,
} from 'react-icons/lu';
import { SiBitbucket, SiGithub, SiGitlab } from 'react-icons/si';
import { VscAzureDevops } from 'react-icons/vsc';

import type { ForgeAccount, ForgeKind, ReachableRepo } from '@midnite/studio-shared';

import type { IconComponent } from '../../../components/icon-button';
import { useAccountSwitcherStore } from '../../../components/account-switcher-store';
import { SettingsSwitchRow } from '../../../components/form/settings-switch-row';
import { UserAvatar } from '../../../components/user-avatar';
import {
  useAddForgeAccount,
  useCloneReachableRepo,
  useForgeAccounts,
  useReachableRepos,
  useRemoveForgeAccount,
  useSwitchForgeAccount,
} from '../../../services/queries';
import {
  FORGE_SWITCHER_PLACEMENTS,
  useUiStore,
  type ForgeSwitcherPlacement,
} from '../../../store/ui-store';
import { Field, TextField } from './controls';
import { ReachableRepoActions } from './reachable-repo-actions';
import { ReachableRepoRow } from './reachable-repo-row';

/**
 * Exported for `onboarding/steps/forge-connect-step.tsx` (Phase 90 Theme I):
 * the wizard's "Connect your forges" step is the same add-account action as
 * this page's own form, so it reads the identical host/label/scope text
 * rather than keeping a second copy that can drift from this one.
 */
export type SupportedKind = Exclude<ForgeKind, 'unknown'>;

/**
 * No self-hosted host picker — Theme B's own scope guardrail (matching
 * `CLAUDE.md`'s "no self-hosted GitLab/Bitbucket Server/Azure DevOps Server"
 * line). Each of these three hosts is the one real one for its kind; a
 * self-hosted instance is recognised by the URL parser (Theme A) and
 * declared `unsupported` by the capability matrix rather than offered here.
 */
export const PROVIDER_HOST: Record<SupportedKind, string> = {
  github: 'github.com',
  gitlab: 'gitlab.com',
  bitbucket: 'bitbucket.org',
  azure: 'dev.azure.com',
};

export const PROVIDER_LABEL: Record<SupportedKind, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
  azure: 'Azure DevOps',
};

/** Each provider's own logo, not a generic forge glyph — the same reasoning
 *  `CLAUDE.md`'s icon convention gives for `react-icons` fronting ~30 sets:
 *  the brand mark reads as "GitHub" at a glance in a way a shared git-forge
 *  icon can't. Simple Icons (`si`) carries GitHub/GitLab/Bitbucket; Simple
 *  Icons has no Azure DevOps mark, so that one comes from VS Code's icon set
 *  (`vsc`) instead — still a per-set `react-icons` import, just a different
 *  set for the one brand the other doesn't have. */
export const PROVIDER_ICON: Record<SupportedKind, IconComponent> = {
  github: SiGithub,
  gitlab: SiGitlab,
  bitbucket: SiBitbucket,
  azure: VscAzureDevops,
};

/**
 * Each provider's brand colour, one place, beside the rest of the provider
 * definitions above. `light`/`dark` are almost always the same value —
 * GitLab's orange, Bitbucket's and Azure DevOps' blues are saturated enough
 * to read against both the app's light and dark surfaces unchanged. GitHub
 * is the one exception: its brand colour is a near-black (#181717), which
 * all but disappears against this app's dark theme, so `dark` swaps it for
 * GitHub's own light-on-dark foreground (`#f0f6fc`, the colour GitHub's own
 * dark theme uses for text against black) instead of inventing a new one.
 * Consumed via the `--brand-light`/`--brand-dark` custom properties and the
 * `.forge-provider-option` rule in `styles.css`, which is what lets the
 * button pick the right one per theme without this file knowing which theme
 * is active.
 */
export interface ForgeBrandColor {
  light: string;
  dark: string;
}

export const PROVIDER_BRAND_COLOR: Record<SupportedKind, ForgeBrandColor> = {
  github: { light: '#181717', dark: '#f0f6fc' },
  gitlab: { light: '#FC6D26', dark: '#FC6D26' },
  bitbucket: { light: '#0052CC', dark: '#0052CC' },
  azure: { light: '#0078D7', dark: '#0078D7' },
};

/** The exact scopes each provider needs, spelled out — `projects-page.tsx`'s
 *  own style for `gh auth refresh -s project`. */
export const PROVIDER_TOKEN_HINT: Record<SupportedKind, string> = {
  github:
    'Leave this blank to use the GitHub CLI (`gh auth login`) — the same credential every other GitHub read in this app already uses. Paste a personal access token only to add a second GitHub identity.',
  gitlab: 'A personal access token with the `read_api` scope (Settings ▸ Access Tokens on gitlab.com).',
  bitbucket:
    'A workspace API token, or an App Password, with repository read access (Personal settings ▸ App passwords).',
  azure:
    'A personal access token with Code (Read), Work Items (Read & Write) and Build (Read) scopes (User settings ▸ Personal access tokens).',
};

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
 */
export function AccountsPage() {
  const { data: accounts = [] } = useForgeAccounts();
  const addAccount = useAddForgeAccount();
  const removeAccount = useRemoveForgeAccount();
  const switchAccount = useSwitchForgeAccount();

  const [kind, setKind] = useState<SupportedKind>('github');
  const [token, setToken] = useState('');

  const activeId = useUiStore((s) => s.forgeActiveAccountId);
  const activeAccount = accounts.find((a) => a.id === activeId) ?? null;
  const scopeReposToActiveAccount = useUiStore((s) => s.forgeScopeReposToActiveAccount);
  const setScopeReposToActiveAccount = useUiStore((s) => s.setForgeScopeReposToActiveAccount);
  const switcherPlacement = useUiStore((s) => s.forgeSwitcherPlacement);
  const setSwitcherPlacement = useUiStore((s) => s.setForgeSwitcherPlacement);
  const syncGhAuthSwitch = useUiStore((s) => s.forgeSyncGhAuthSwitch);
  const setSyncGhAuthSwitch = useUiStore((s) => s.setForgeSyncGhAuthSwitch);
  /*
    The onboarding wizard's "Connect your forges" step (Phase 90 Theme I,
    `onboarding-steps.ts`'s `id: 'forges'`) records itself here on Skip. A
    literal id rather than an import of `ONBOARDING_STEPS`: that module
    already imports this file (`forge-connect-step.tsx` reads
    `PROVIDER_HOST`/`PROVIDER_LABEL`/`PROVIDER_TOKEN_HINT` below), so
    importing it back would be a cycle for one string.
  */
  const skippedForgeStep = useUiStore((s) => s.onboardingSkippedStepIds.includes('forges'));
  const clearSkippedForgeStep = useUiStore((s) => s.setOnboardingStepSkipped);

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

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    addAccount.mutate(
      { kind, host: PROVIDER_HOST[kind], token: token.trim() || undefined },
      { onSuccess: (result) => result.ok && setToken('') },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {skippedForgeStep ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          <span>You skipped connecting a forge during setup — add one below whenever you're ready.</span>
          <button
            type="button"
            onClick={() => clearSkippedForgeStep('forges', false)}
            className="shrink-0 rounded px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
          >
            Got it
          </button>
        </div>
      ) : null}
      <Accordion title="Accounts" icon={<LuCircleUserRound className="h-4 w-4" />} defaultOpen>
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
                onRemove={() => removeAccount.mutate(account.id)}
              />
            ))
          )}
        </div>
      </Accordion>

      <Accordion title="Add an account" icon={<LuPlus className="h-4 w-4" />} defaultOpen>
        <form
          ref={addFormRef}
          aria-label="Add an account"
          className="flex flex-col gap-3 p-3"
          onSubmit={submit}
        >
          <ForgeProviderPicker value={kind} onChange={setKind} />
          <Field label="Personal access token" hint={PROVIDER_TOKEN_HINT[kind]}>
            <TextField
              value={token}
              onChange={setToken}
              label="Personal access token"
              placeholder={kind === 'github' ? '(optional)' : 'paste a token'}
              className="font-mono"
            />
          </Field>
          {addAccount.data && !addAccount.data.ok ? (
            <p role="alert" className="text-[11px] text-red-500">
              {addAccount.data.error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={addAccount.isPending || (kind !== 'github' && token.trim().length === 0)}
            className="h-7 w-fit rounded-md border border-border px-3 text-xs font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {addAccount.isPending ? 'Verifying…' : `Add ${PROVIDER_LABEL[kind]} account`}
          </button>
        </form>
      </Accordion>

      <Accordion
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
      </Accordion>

      {activeAccount ? <ReachableReposSection account={activeAccount} /> : null}

      <Accordion title="How this works" icon={<LuInfo className="h-4 w-4" />}>
        <div className="flex flex-col gap-2 p-3 text-[11px] leading-relaxed text-muted-foreground">
          <p>
            Adding an account validates the token first — a token this app cannot verify is never
            stored. GitHub accounts hold no token at all: <code>gh</code> remains the credential,
            exactly as every other GitHub read in this app already works.
          </p>
          <p>
            Every other token is encrypted with your OS keychain before it ever touches disk, and
            this page is only ever told whether a token exists — never what it is.
          </p>
        </div>
      </Accordion>
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

const PROVIDER_KINDS: readonly SupportedKind[] = ['github', 'gitlab', 'bitbucket', 'azure'];

/**
 * The "Provider" field on the add-account form — a `Choice`-style segmented
 * control, not `Choice` itself: `Choice` is generic over plain `[value,
 * label]` string tuples shared with every other settings page, and has no
 * room for a per-option icon or colour without teaching that shared control
 * about brand colours it has no other consumer for. So this stays a small
 * one-off beside `PROVIDER_ICON`/`PROVIDER_BRAND_COLOR` above, matching
 * `Choice`'s own layout (`Field` wrapper, `role="radiogroup"`) so the swap
 * reads as the same control with icons, not a different one.
 */
function ForgeProviderPicker({
  value,
  onChange,
}: {
  value: SupportedKind;
  onChange: (next: SupportedKind) => void;
}) {
  return (
    <Field label="Provider" hint="Which forge this identity belongs to.">
      <div role="radiogroup" aria-label="Provider" className="flex flex-wrap gap-1">
        {PROVIDER_KINDS.map((providerKind) => {
          const Icon = PROVIDER_ICON[providerKind];
          const brand = PROVIDER_BRAND_COLOR[providerKind];
          const selected = value === providerKind;
          return (
            <button
              key={providerKind}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(providerKind)}
              /*
                `--brand-light`/`--brand-dark` are the only theme-aware bit —
                `.forge-provider-option` in styles.css picks the right one
                into `--forge-brand` per `.dark`, so the `color-mix()` below
                never has to know which theme is active. Selected-only border
                and wash; the icon carries its brand colour regardless of
                selection, which is the "tint the icon" half of the ask.
              */
              style={
                {
                  '--brand-light': brand.light,
                  '--brand-dark': brand.dark,
                  ...(selected
                    ? {
                        borderColor: 'color-mix(in srgb, var(--forge-brand) 55%, transparent)',
                        background: 'color-mix(in srgb, var(--forge-brand) 14%, transparent)',
                      }
                    : {}),
                } as CSSProperties
              }
              className={`forge-provider-option flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors ${
                selected
                  ? 'text-foreground'
                  : 'border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              <Icon
                aria-hidden
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: 'var(--forge-brand)' }}
              />
              {PROVIDER_LABEL[providerKind]}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

function AccountRow({
  account,
  active,
  onMakeActive,
  onRemove,
}: {
  account: ForgeAccount;
  active: boolean;
  onMakeActive: () => void;
  onRemove: () => void;
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
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${account.displayName || account.login}`}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <LuTrash2 className="h-3.5 w-3.5" />
      </button>
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
    <Accordion
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
    </Accordion>
  );
}
