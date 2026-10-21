import { LuCheck } from 'react-icons/lu';

import { useUiStore } from '../../../store/ui-store';
import { ForgeMark } from '../forge-mark';

export const SETUP_FORGES: readonly {
  kind: 'github' | 'gitlab' | 'bitbucket' | 'azure';
  label: string;
}[] = [
  { kind: 'github', label: 'GitHub' },
  { kind: 'gitlab', label: 'GitLab' },
  { kind: 'bitbucket', label: 'Bitbucket' },
  { kind: 'azure', label: 'Azure DevOps' },
];

/** Toggle `kind` in the persisted selection, keeping the catalogue's order. */
export function toggleForge(selected: readonly string[], kind: string): string[] {
  const next = selected.includes(kind) ? selected.filter((k) => k !== kind) : [...selected, kind];
  return SETUP_FORGES.map((f) => f.kind).filter((k) => next.includes(k));
}

/**
 * The forge-selection page (Phase 98 Theme E): which forges do you use?
 * Multi-select toggle buttons; the choice persists in `setupState.forges` and
 * decides which CLI rows the next page shows. Connecting accounts is the
 * accounts page's job (Theme F), not this one's.
 */
export function ForgeSelectPage() {
  const selected = useUiStore((s) => s.setupState.forges ?? []);
  const update = useUiStore((s) => s.updateSetupState);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Which forges do you use? Pick as many as apply.
      </p>
      <div role="group" aria-label="Forges" className="grid grid-cols-2 gap-2">
        {SETUP_FORGES.map(({ kind, label }) => {
          const on = selected.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={on}
              onClick={() => update({ forges: toggleForge(selected, kind) })}
              className={`flex items-center gap-2 rounded-md border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                on
                  ? 'border-primary bg-primary/10'
                  : 'border-border/60 bg-muted/30 hover:bg-muted/60'
              }`}
            >
              <ForgeMark kind={kind} />
              <span className="flex-1">{label}</span>
              {on ? <LuCheck aria-hidden className="h-4 w-4 text-primary" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
