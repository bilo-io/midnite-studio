import { COMMANDS } from '@midnite/studio-shared';

import { displayChord } from '../shell/nav-config';

/**
 * Settings ▸ Keyboard shortcuts — the suite's chord table, read-only (Phase 123 Theme L.3). One row per
 * command that has a chord, straight from `COMMANDS`, so it cannot drift from what the dispatcher binds.
 */
export function ChordsPage({ mac }: { mac?: boolean }) {
  const rows = COMMANDS.filter((command) => 'chord' in command && command.chord !== undefined);
  return (
    <table aria-label="Keyboard shortcuts" className="w-full text-sm">
      <tbody>
        {rows.map((command) => (
          <tr key={command.id} className="border-b border-border/40">
            <td className="py-1.5 pr-4">{command.label}</td>
            <td className="py-1.5 text-right">
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                {displayChord((command as { chord: string }).chord, mac)}
              </kbd>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
