import { LuAudioLines, LuMusic } from 'react-icons/lu';

import type { IconComponent } from '../../../components/icon-button';

export type AudioMode = 'editor' | 'generator';

const MODES: ReadonlyArray<{ id: AudioMode; label: string; icon: IconComponent }> = [
  { id: 'editor', label: 'Editor', icon: LuMusic },
  { id: 'generator', label: 'Generator', icon: LuAudioLines },
];

/** Phase 101 Theme A: the Editor | Generator switch in Audio's toolbar. */
export function AudioSubTabs({ mode, onChange }: { mode: AudioMode; onChange: (mode: AudioMode) => void }) {
  return (
    <div role="tablist" aria-label="Audio mode" className="flex items-center gap-0.5 rounded-md bg-muted/50 p-0.5">
      {MODES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={mode === id}
          data-testid={`audio-mode-${id}`}
          onClick={() => onChange(id)}
          className={`flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors ${
            mode === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Icon className="h-3 w-3" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}
