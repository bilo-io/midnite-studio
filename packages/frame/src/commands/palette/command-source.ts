import { COMMANDS, type CommandGroup, type CommandId } from '@midnite/studio-shared';

import type { IconComponent } from '../../chrome/types';
import type { CommandRuntime } from '../command-runtime';
import { chordOf, groupCommands } from './palette-store';
import type { PaletteItem, PaletteSource } from './source';

/** Palette section headings for a command's `CommandGroup`. */
export const COMMAND_GROUP_LABELS: Record<CommandGroup, string> = {
  repository: 'Repository',
  view: 'View',
  sync: 'Sync',
  terminal: 'Terminal',
  status: 'Status',
  graph: 'Graph',
  operation: 'Operations',
  palette: 'Palette',
  files: 'Files',
  window: 'Window',
};

export type CommandSourceOptions = {
  /**
   * A further filter on top of "the app has a handler for it" — Studio's palette-safety list.
   * Read per open, so it may consult the runtime (e.g. hide a command while it is disabled).
   */
  include?: (id: CommandId, runtime: CommandRuntime) => boolean;
  /** The row's glyph. */
  icon?: (id: CommandId) => IconComponent | undefined;
};

/**
 * The palette's command rows (Phase 123 Theme D): every `COMMANDS` entry the app's runtime has a
 * handler for, in `COMMANDS` order, grouped. A command with no entry is not this app's and is not
 * listed, so `Mod+k` shows only what works here; one that is present but disabled is listed greyed
 * with its reason.
 */
export function createCommandSource(
  runtime: CommandRuntime,
  onSelect: () => void,
  options: CommandSourceOptions = {},
): PaletteSource {
  return {
    key: 'commands',
    items: () => {
      const listed = COMMANDS.filter(
        (cmd) => runtime[cmd.id] !== undefined && (options.include?.(cmd.id, runtime) ?? true),
      );

      const items: PaletteItem[] = [];
      for (const [group, commands] of groupCommands(listed)) {
        const displayGroup = COMMAND_GROUP_LABELS[group] ?? 'Commands';
        for (const cmd of commands) {
          const entry = runtime[cmd.id];
          items.push({
            id: `command:${cmd.id}`,
            label: cmd.label,
            group: displayGroup,
            icon: options.icon?.(cmd.id),
            chord: chordOf(cmd),
            disabled: !entry?.enabled,
            disabledReason: entry?.disabledReason,
            run: () => {
              if (!entry?.enabled) return;
              onSelect();
              entry.run();
            },
          });
        }
      }
      return items;
    },
  };
}
