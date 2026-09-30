import { LuCheck, LuCloud } from 'react-icons/lu';
import { SiBitbucket, SiGithub, SiGitlab } from 'react-icons/si';

import type { IconComponent } from '../../../components/icon-button';
import { useUiStore } from '../../../store/ui-store';

export const SETUP_FORGES: readonly {
  kind: 'github' | 'gitlab' | 'bitbucket' | 'azure';
  label: string;
  icon: IconComponent;
  color: string;
}[] = [
  { kind: 'github', label: 'GitHub', icon: SiGithub, color: '#8B949E' },
  { kind: 'gitlab', label: 'GitLab', icon: SiGitlab, color: '#FC6D26' },
  { kind: 'bitbucket', label: 'Bitbucket', icon: SiBitbucket, color: '#2684FF' },
  { kind: 'azure', label: 'Azure DevOps', icon: LuCloud, color: '#0078D4' },
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
        {SETUP_FORGES.map(({ kind, label, icon: Icon, color }) => {
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
              <Icon aria-hidden className="h-4 w-4 shrink-0" style={{ color }} />
              <span className="flex-1">{label}</span>
              {on ? <LuCheck aria-hidden className="h-4 w-4 text-primary" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
