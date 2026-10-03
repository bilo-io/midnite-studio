import { LuX } from 'react-icons/lu';

import { formatChord, SHORTCUTS, type Shortcut } from './shortcuts';

const GROUPS: Shortcut['group'][] = ['Tools', 'Edit', 'Selection', 'View'];
const isMac = (): boolean => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The editor's keyboard cheat sheet, read from the one `SHORTCUTS` table the handler is tested against. */
export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const mac = isMac();
  return (
    <div
      role="dialog"
      aria-label="Keyboard shortcuts"
      className="absolute right-2 top-2 z-20 max-h-[calc(100%-1rem)] w-80 overflow-auto rounded-lg border border-border bg-card p-3 text-xs shadow-lg"
    >
      <div className="mb-2 flex items-center">
        <h3 className="text-sm font-medium text-foreground">Keyboard shortcuts</h3>
        <button type="button" aria-label="Close shortcuts" onClick={onClose} className="ml-auto flex h-5 w-5 items-center justify-center rounded hover:bg-accent">
          <LuX aria-hidden className="h-3.5 w-3.5" />
        </button>
      </div>
      {GROUPS.map((group) => (
        <section key={group} className="mb-2">
          <h4 className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">{group}</h4>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            {SHORTCUTS.filter((s) => s.group === group).map((s) => (
              <div key={s.chord} className="contents">
                <dt>
                  <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px] text-foreground">{formatChord(s.chord, mac)}</kbd>
                </dt>
                <dd className="text-muted-foreground">{s.label}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
