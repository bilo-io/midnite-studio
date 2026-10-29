import type { CommandId } from '@midnite/studio-shared';

export type CommandEntry = {
  run: () => void;
  enabled: boolean;
  /** Present only when disabled — appended to the tooltip, per icon-button.tsx. */
  disabledReason?: string;
};

/**
 * What every source of a command — the keyboard, the native menu, the palette — resolves against.
 *
 * Partial since Phase 123 Theme D: a suite app binds only the commands it has (`SUITE_COMMANDS`, or
 * fewer), and a command with no entry is simply not this app's — its chord reaches the page, the
 * palette does not list it, a menu dispatch of it does nothing. Studio still passes a total record.
 */
export type CommandRuntime = Partial<Record<CommandId, CommandEntry>>;
