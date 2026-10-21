import { PiDownloadSimple, PiDownloadSimpleFill } from 'react-icons/pi';

import { planSetupInstall, setupItem, type SetupItem } from '@midnite/studio-shared';

import { EmptyStateButton } from '../../components/empty-state';

/**
 * The install buttons for a set of catalogue items (Phase 98 Theme D's
 * `planSetupInstall`, rendered): one brew line with Homebrew, or — without it —
 * Homebrew's own installer and, for git, Apple's Command Line Tools first.
 * Shared by the git, forge-CLI and toolchain pages so each offers the same
 * thing the same way.
 */
export function SetupInstallActions({
  items,
  brewInstalled,
  onRun,
  disabled,
}: {
  items: readonly SetupItem[];
  brewInstalled: boolean;
  onRun: (command: string, title: string) => void;
  disabled?: boolean;
}) {
  const options = planSetupInstall(items, brewInstalled);
  if (options.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((option, index) =>
        index === 0 ? (
          <EmptyStateButton
            key={option.id}
            icon={PiDownloadSimple}
            filledIcon={PiDownloadSimpleFill}
            label={option.label}
            disabled={disabled}
            onClick={() => onRun(option.command, option.label)}
          />
        ) : (
        <button
          key={option.id}
          type="button"
          disabled={disabled}
          onClick={() => onRun(option.command, option.label)}
          className="rounded border border-border px-3 py-1 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {option.label}
        </button>
        ),
      )}
    </div>
  );
}

/** Catalogue rows for ids, dropping any the catalogue does not know. */
export function setupItems(ids: readonly string[]): SetupItem[] {
  return ids.flatMap((id) => {
    const item = setupItem(id);
    return item ? [item] : [];
  });
}
