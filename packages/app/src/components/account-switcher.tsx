import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { LuSettings, LuUserPlus } from 'react-icons/lu';

import type { ForgeAccount } from '@midnite/studio-shared';

import {
  PROVIDER_BRAND_COLOR,
  PROVIDER_ICON,
  type SupportedKind,
} from '../features/settings/settings-pages/accounts-page';
import { useAccountScopedRepos } from '../features/repos/forge-account-scope';
import { useForgeAccounts, useRepos, useSwitchForgeAccount } from '../services/queries';
import { useUiStore, type ForgeSwitcherPlacement } from '../store/ui-store';
import { openAccountsSettings, useAccountSwitcherStore } from './account-switcher-store';
import { ContextMenu, type MenuItem, type MenuPosition } from './context-menu';
import type { IconComponent } from './icon-button';
import { Tooltip } from './tooltip';
import { UserAvatar } from './user-avatar';

/**
 * The forge account switcher (Phase 90 Theme L) — Theme B's avatar and Theme
 * C's switch, finally in one control. One component, two layouts:
 *
 * - `titlebar`: the 24px icon button Theme B's `TitleBarAccount` was.
 * - `rail`: a row in the rail's own icon + label shape. It has no chord, so
 *   per the rail convention (`CLAUDE.md`) it carries no hover bubble while
 *   its label is on screen; collapsed, the bubble is the account name.
 *
 * `app.tsx` mounts exactly one of these, at the slot `forgeSwitcherPlacement`
 * names. The menu is the shared `ContextMenu` — no new menu primitive — and
 * a row's click is `useSwitchForgeAccount`, so Theme C's cancel-then-
 * invalidate, repo scoping, gated `gh auth switch` and the Decisions
 * section's "toast what it hid, with an undo" all come with it.
 *
 * With no account at all it is an "Add account" placeholder rather than
 * nothing: this is the one path to adding an account outside Settings, and
 * hiding it on a fresh install would hide the feature with it.
 */
export type AccountSwitcherLayout = 'titlebar' | 'rail';

/** Every placement but `'hidden'` names a slot `app.tsx` renders. */
export type AccountSwitcherSlotId = Exclude<ForgeSwitcherPlacement, 'hidden'>;

/**
 * One of the four places the switcher can live. `app.tsx` renders all four
 * slots unconditionally; each one reads `forgeSwitcherPlacement` itself and
 * renders the switcher only when it is the slot the setting names — which is
 * what makes "exactly one switcher, or none for `'hidden'`" a property of
 * this component rather than of four conditionals scattered through the app.
 */
export function AccountSwitcherSlot({
  slot,
  expanded = false,
}: {
  slot: AccountSwitcherSlotId;
  /** Rail slots only — the rail's `expanded`, from AppFrame's slot context. */
  expanded?: boolean;
}) {
  const placement = useUiStore((s) => s.forgeSwitcherPlacement);
  if (placement !== slot) return null;
  if (slot === 'rail-top' || slot === 'rail-bottom') {
    return <AccountSwitcher layout="rail" expanded={expanded} />;
  }
  // Only the right cluster needs a leading rule: on the left the switcher
  // sits between the reload button and the breadcrumbs' own divider.
  return <AccountSwitcher layout="titlebar" leadingHairline={slot === 'titlebar-right'} />;
}

export function AccountSwitcher({
  layout,
  expanded = false,
  leadingHairline = false,
}: {
  layout: AccountSwitcherLayout;
  /** Rail only — whether the rail is expanded, i.e. whether the label shows. */
  expanded?: boolean;
  /** Title bar only — draw a hairline ahead of the button (the right cluster). */
  leadingHairline?: boolean;
}) {
  useForgeAccounts();
  const accounts = useUiStore((s) => s.forgeAccounts);
  const activeId = useUiStore((s) => s.forgeActiveAccountId);
  const active = accounts.find((a) => a.id === activeId) ?? null;

  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<MenuPosition | null>(null);
  /*
    The menu closes itself on any outside mousedown, in the capture phase —
    so a click on this button while the menu is open would close it on
    mousedown and reopen it on click. Remembering "was open" at mousedown is
    what makes the button a toggle.
  */
  const wasOpenAtPointerDown = useRef(false);

  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenu(
      layout === 'rail'
        ? { x: rect.right + 4, y: rect.top }
        : { x: rect.left, y: rect.bottom + 4 },
    );
  };

  /*
    `account.switcher.open` from the palette. The value at mount is not a
    request — only a change after it is — so a switcher that remounts (a
    placement change, say) does not replay the last one.
  */
  const openRequest = useAccountSwitcherStore((s) => s.openRequest);
  const seenRequest = useRef(openRequest);
  useEffect(() => {
    if (openRequest === seenRequest.current) return;
    seenRequest.current = openRequest;
    if (accounts.length === 0) openAccountsSettings({ focusAddForm: true });
    else openMenu();
    // `openMenu` reads only a ref and `layout`; re-running on it would fire
    // on every render rather than per request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest]);

  if (accounts.length === 0) {
    return (
      <SwitcherButton
        buttonRef={buttonRef}
        layout={layout}
        expanded={expanded}
        leadingHairline={leadingHairline}
        label="Add account"
        rowLabel="Add account"
        glyph={<LuUserPlus aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />}
        onClick={() => openAccountsSettings({ focusAddForm: true })}
      />
    );
  }

  const name = active ? active.displayName || active.login : 'Choose account';
  const label = active ? `${name} (${active.kind}) — switch account` : 'Choose account';

  return (
    <>
      <SwitcherButton
        buttonRef={buttonRef}
        layout={layout}
        expanded={expanded}
        leadingHairline={leadingHairline}
        label={label}
        rowLabel={name}
        glyph={
          active ? (
            <UserAvatar
              login={active.login}
              name={active.displayName}
              src={active.avatarUrl}
              size={16}
              withTooltip={false}
            />
          ) : (
            <LuUserPlus aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
          )
        }
        haspopup
        open={menu !== null}
        onPointerDown={() => {
          wasOpenAtPointerDown.current = menu !== null;
        }}
        onClick={() => {
          if (wasOpenAtPointerDown.current) {
            wasOpenAtPointerDown.current = false;
            setMenu(null);
            return;
          }
          openMenu();
        }}
      />
      {menu ? (
        <AccountSwitcherMenu
          position={menu}
          accounts={accounts}
          activeId={activeId}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </>
  );
}

function SwitcherButton({
  buttonRef,
  layout,
  expanded,
  leadingHairline,
  label,
  rowLabel,
  glyph,
  haspopup = false,
  open = false,
  onPointerDown,
  onClick,
}: {
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  layout: AccountSwitcherLayout;
  expanded: boolean;
  leadingHairline: boolean;
  /** Accessible name — and, in the title bar, the hover bubble. */
  label: string;
  /** What the expanded rail row prints beside the glyph. */
  rowLabel: string;
  glyph: React.ReactNode;
  haspopup?: boolean;
  open?: boolean;
  onPointerDown?: () => void;
  onClick: () => void;
}) {
  const popupProps = haspopup ? { 'aria-haspopup': 'menu' as const, 'aria-expanded': open } : {};

  if (layout === 'rail') {
    const row = (
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        data-account-switcher="rail"
        {...popupProps}
        onMouseDown={onPointerDown}
        onClick={onClick}
        className={`flex w-full shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${
          expanded ? '' : 'justify-center'
        }`}
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">{glyph}</span>
        {expanded ? <span className="min-w-0 truncate">{rowLabel}</span> : null}
      </button>
    );
    // Expanded, the label is already on screen and there is no chord to
    // teach — so no bubble at all. Collapsed, the name is the bubble.
    return expanded ? (
      row
    ) : (
      <Tooltip label={rowLabel} side="right">
        {row}
      </Tooltip>
    );
  }

  return (
    <>
      {leadingHairline ? <span aria-hidden className="h-4 w-px shrink-0 bg-border" /> : null}
      <Tooltip label={label} side="bottom">
        <button
          ref={buttonRef}
          type="button"
          aria-label={label}
          data-account-switcher="titlebar"
          {...popupProps}
          onMouseDown={onPointerDown}
          onClick={onClick}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent"
        >
          {glyph}
        </button>
      </Tooltip>
    </>
  );
}

/**
 * The menu body — mounted only while open, so the per-repo remote fan-out
 * behind the hidden-repos count (`useAccountScopedRepos`) runs only while
 * someone is looking at it, and shares its cache with `repos-panel.tsx`.
 */
function AccountSwitcherMenu({
  position,
  accounts,
  activeId,
  onClose,
}: {
  position: MenuPosition;
  accounts: readonly ForgeAccount[];
  activeId: string | null;
  onClose: () => void;
}) {
  const switchAccount = useSwitchForgeAccount();
  const { data: repos = [] } = useRepos();
  const { outOfScopeCount } = useAccountScopedRepos(repos, { evaluateWhenOff: true });
  const scoping = useUiStore((s) => s.forgeScopeReposToActiveAccount);
  const setScoping = useUiStore((s) => s.setForgeScopeReposToActiveAccount);

  const items = useMemo<MenuItem[]>(() => {
    const rows: MenuItem[] = accounts.map((account) => ({
      id: `account:${account.id}`,
      label: account.displayName || account.login,
      description: account.delegated === 'gh' ? `${account.host} · via gh` : account.host,
      icon: accountGlyph(account),
      checked: account.id === activeId,
      checkKind: 'radio',
      onSelect: () => {
        if (account.id !== activeId) switchAccount.mutate(account.id);
      },
    }));

    if (outOfScopeCount > 0) {
      const noun = outOfScopeCount === 1 ? 'repository' : 'repositories';
      rows.push({ type: 'separator' });
      rows.push({
        id: 'hidden-repos',
        label: "Hide other accounts' repos",
        description: scoping
          ? `${outOfScopeCount} ${noun} hidden for this account`
          : `${outOfScopeCount} ${noun} outside this account`,
        checked: scoping,
        checkKind: 'checkbox',
        onSelect: () => setScoping(!scoping),
      });
    }

    rows.push({ type: 'separator' });
    rows.push({
      id: 'add-account',
      label: 'Add account…',
      icon: LuUserPlus,
      onSelect: () => openAccountsSettings({ focusAddForm: true }),
    });
    rows.push({
      id: 'manage-accounts',
      label: 'Manage accounts…',
      icon: LuSettings,
      onSelect: () => openAccountsSettings(),
    });
    return rows;
  }, [accounts, activeId, outOfScopeCount, scoping, setScoping, switchAccount]);

  return <ContextMenu position={position} items={items} onClose={onClose} />;
}

/**
 * A menu-row glyph for one account: its avatar, with the provider's mark in
 * brand colour badged on the corner. Built per account because the menu's
 * `icon` slot takes a component, not a node — the same structural
 * `IconComponent` every other row's glyph satisfies.
 *
 * The badge resolves its colour through `.forge-provider-option`'s
 * `--brand-light`/`--brand-dark` → `--forge-brand` rule (`styles.css`, PR
 * #515) — the one place that knows which theme is active, so GitHub's
 * near-black swaps for its light fallback in dark mode here too.
 */
function accountGlyph(account: ForgeAccount): IconComponent {
  const kind = account.kind as SupportedKind;
  const Mark = PROVIDER_ICON[kind];
  const brand = PROVIDER_BRAND_COLOR[kind];

  function AccountGlyph({ className }: { className?: string }) {
    return (
      <span
        aria-hidden
        data-provider={account.kind}
        className={`relative inline-flex ${className ?? ''}`}
      >
        <UserAvatar
          login={account.login}
          name={account.displayName}
          src={account.avatarUrl}
          size={14}
          withTooltip={false}
        />
        {Mark && brand ? (
          <span className="absolute -bottom-1 -right-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-popover">
            <Mark
              aria-hidden
              className="forge-provider-option h-2 w-2"
              style={
                {
                  '--brand-light': brand.light,
                  '--brand-dark': brand.dark,
                  color: 'var(--forge-brand)',
                } as CSSProperties
              }
            />
          </span>
        ) : null}
      </span>
    );
  }
  return AccountGlyph;
}
