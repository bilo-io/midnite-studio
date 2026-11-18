import { FrameModal } from '@midnite/studio-frame';

import { useOccludeWhile } from '../chrome';
import { formatChord, isMac, LEVEL_SHORTCUTS, shortcutApplies, type LevelShortcut, type LevelShortcutGroup } from './level-shortcuts';

const GROUPS: readonly LevelShortcutGroup[] = ['Tools', 'Selection', 'Edit', 'View'];

type Props = { open: boolean; onClose: () => void; view: 'plan' | '3d'; dimension: '2d' | '3d'; mac?: boolean };

/** The level editor's keyboard cheat-sheet: `LEVEL_SHORTCUTS` filtered to the current view and dimension, one row per command. */
export function LevelShortcutHelp({ open, onClose, view, dimension, mac = isMac() }: Props) {
  useOccludeWhile(open);
  const live = LEVEL_SHORTCUTS.filter((row) => shortcutApplies(row, { view, dimension }));
  return (
    <FrameModal open={open} onClose={onClose} title="Level editor shortcuts" size="lg" testId="level-shortcut-help">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs sm:grid-cols-4">
        {GROUPS.map((group) => {
          // A command with two chords (Delete, Backspace) is one line.
          const rows = new Map<string, { label: string; chords: string[] }>();
          for (const row of live.filter((r: LevelShortcut) => r.group === group)) {
            const hit = rows.get(row.id) ?? { label: row.label, chords: [] };
            hit.chords.push(formatChord(row.chord, mac));
            rows.set(row.id, hit);
          }
          return (
            <section key={group} aria-label={group}>
              <h4 className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">{group}</h4>
              <dl className="space-y-1">
                {[...rows.values()].map((r) => (
                  <div key={r.label} className="flex items-center justify-between gap-2">
                    <dd className="text-muted-foreground">{r.label}</dd>
                    <dt className="flex shrink-0 gap-1">
                      {r.chords.map((c) => (
                        <kbd key={c} className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{c}</kbd>
                      ))}
                    </dt>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>
    </FrameModal>
  );
}
