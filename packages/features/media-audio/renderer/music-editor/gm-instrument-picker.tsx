import { GM_DRUM_CHANNEL, gmProgramsByFamily } from '@midnite/studio-shared';
import { useMemo, useState } from 'react';
import { LuCheck, LuDownload, LuDrum, LuTriangleAlert } from 'react-icons/lu';

import { useGmSamples, type GmDownloadState } from './use-gm-samples';

/**
 * The General MIDI instrument picker (Phase 101 Theme D): all 128 programs grouped by family, each
 * with a cached or download badge, plus the channel-10 drum kit (synthesised, always available).
 * Selecting an instrument that is not downloaded is allowed — it plays through a synth stand-in
 * with a visible hint, never silence.
 */

/** A track's instrument: a GM program, or the drum kit (channel 10). */
export type GmSelection = { kind: 'program'; program: number } | { kind: 'drums' };

export type GmInstrumentPickerViewProps = {
  value: GmSelection;
  onChange: (value: GmSelection) => void;
  cached: ReadonlySet<number>;
  downloads: GmDownloadState;
  onDownload: (program: number) => void;
};

export function GmNotDownloadedHint({ className = '' }: { className?: string }) {
  return (
    <p role="status" className={`flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 ${className}`}>
      <LuTriangleAlert aria-hidden className="h-3 w-3 shrink-0" />
      Not downloaded — playing with a synth stand-in until the samples are cached.
    </p>
  );
}

function Badge({ cached, download }: { cached: boolean; download?: { fraction: number; error?: string } }) {
  if (download && !download.error) {
    return (
      <span className="shrink-0 rounded-full bg-primary/15 px-1.5 text-[10px] tabular-nums text-primary">
        {Math.round(download.fraction * 100)}%
      </span>
    );
  }
  if (cached) {
    return (
      <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 text-[10px] text-emerald-700 dark:text-emerald-400">
        <LuCheck aria-hidden className="h-2.5 w-2.5" />
        Cached
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
      <LuDownload aria-hidden className="h-2.5 w-2.5" />
      {download?.error ? 'Retry' : 'Download'}
    </span>
  );
}

export function GmInstrumentPickerView({ value, onChange, cached, downloads, onDownload }: GmInstrumentPickerViewProps) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return gmProgramsByFamily()
      .map((group) => ({
        ...group,
        programs: needle
          ? group.programs.filter((p) => p.name.toLowerCase().includes(needle) || group.family.toLowerCase().includes(needle))
          : group.programs,
      }))
      .filter((group) => group.programs.length > 0);
  }, [query]);
  const selectedProgram = value.kind === 'program' ? value.program : null;
  const selectedMissing = selectedProgram !== null && !cached.has(selectedProgram);

  return (
    <div className="flex w-72 flex-col gap-2" data-testid="gm-instrument-picker">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search 128 instruments"
        aria-label="Search instruments"
        className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
      />
      <div role="listbox" aria-label="General MIDI instruments" className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
        <button
          type="button"
          role="option"
          aria-selected={value.kind === 'drums'}
          onClick={() => onChange({ kind: 'drums' })}
          className={`flex items-center gap-2 rounded px-2 py-1 text-left text-xs ${value.kind === 'drums' ? 'bg-accent text-foreground' : 'text-foreground hover:bg-accent/50'}`}
        >
          <LuDrum aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 truncate">Drum kit (channel {GM_DRUM_CHANNEL + 1})</span>
          <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 text-[10px] text-emerald-700 dark:text-emerald-400">Built in</span>
        </button>
        {groups.map((group) => (
          <section key={group.family} aria-label={group.family}>
            <h4 className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{group.family}</h4>
            <ul className="flex flex-col">
              {group.programs.map((p) => {
                const isCached = cached.has(p.program);
                const download = downloads[p.program];
                const selected = selectedProgram === p.program;
                return (
                  <li key={p.program} className="flex items-center">
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => onChange({ kind: 'program', program: p.program })}
                      className={`flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left text-xs ${selected ? 'bg-accent text-foreground' : 'text-foreground hover:bg-accent/50'}`}
                    >
                      <span className="w-6 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">{p.program + 1}</span>
                      <span className="flex-1 truncate">{p.name}</span>
                    </button>
                    {isCached || (download && !download.error) ? (
                      <Badge cached={isCached} download={download} />
                    ) : (
                      <button
                        type="button"
                        onClick={() => onDownload(p.program)}
                        aria-label={`Download ${p.name}`}
                        className="ml-1 rounded-full"
                      >
                        <Badge cached={false} download={download} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {groups.length === 0 && <p className="px-2 text-xs text-muted-foreground">No instrument matches.</p>}
      </div>
      {selectedMissing && <GmNotDownloadedHint />}
    </div>
  );
}

/** {@link GmInstrumentPickerView} wired to the sample cache over the bridge. */
export function GmInstrumentPicker(props: Pick<GmInstrumentPickerViewProps, 'value' | 'onChange'>) {
  const { cached, downloads, download } = useGmSamples();
  return <GmInstrumentPickerView {...props} cached={cached} downloads={downloads} onDownload={(program) => void download(program)} />;
}
