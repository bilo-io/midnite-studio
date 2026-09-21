import { useForgeAccounts } from '../services/queries';
import { useUiStore } from '../store/ui-store';
import { UserAvatar } from './user-avatar';

/**
 * The active-account avatar (Phase 90 Theme B) — the first identity element
 * this title bar has ever carried; `titlebar-status/` next to it is about CI,
 * not identity. Renders nothing until an account exists, so a fresh install
 * with no accounts added shows no stranded control — the same "no battery, no
 * segment" rule `TitleBarBattery` follows.
 *
 * A click opens Settings ▸ Accounts rather than a picker here: switching is
 * Theme C's job, and this avatar's whole scope in Theme B is "show who is
 * active," matching `TitleBarPrimaryAgent`'s own click-through-to-settings
 * shape for a control with more than a toggle behind it.
 */
export function TitleBarAccount() {
  useForgeAccounts();
  const accounts = useUiStore((s) => s.forgeAccounts);
  const activeId = useUiStore((s) => s.forgeActiveAccountId);
  const setActiveView = useUiStore((s) => s.setActiveView);
  const setSettingsPage = useUiStore((s) => s.setSettingsPage);

  const active = accounts.find((a) => a.id === activeId);
  if (!active) return null;

  const label = `${active.displayName || active.login} (${active.kind})`;

  return (
    <>
      <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
      <button
        type="button"
        title={label}
        aria-label={label}
        onClick={() => {
          setActiveView('settings');
          setSettingsPage('accounts');
        }}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent"
      >
        <UserAvatar
          login={active.login}
          name={active.displayName}
          src={active.avatarUrl}
          size={16}
          withTooltip={false}
        />
      </button>
    </>
  );
}
