import { gmProgram, type SongTrack } from '@midnite/studio-shared';
import { LuTrash2 } from 'react-icons/lu';

import { Popover } from '../../../components/popover';
import { GmInstrumentPicker } from './gm-instrument-picker';
import { instrumentOf, type InstrumentChoice } from './model/song-edit';

export const TRACK_ROW_H = 44;

export const instrumentLabel = (track: Pick<SongTrack, 'program' | 'channel'>): string => {
  const choice = instrumentOf(track);
  return choice.kind === 'drums' ? 'Drum kit' : (gmProgram(choice.program)?.name ?? `Program ${choice.program + 1}`);
};

type Props = {
  track: SongTrack;
  active: boolean;
  onSelect: () => void;
  onName: (name: string) => void;
  onColor: (color: string) => void;
  onInstrument: (choice: InstrumentChoice) => void;
  onMute: (on: boolean) => void;
  onSolo: (on: boolean) => void;
  onRemove: () => void;
};

/** One arrangement track header: name, instrument (Theme D's picker), colour, mute, solo. */
export function TrackRow({ track, active, onSelect, onName, onColor, onInstrument, onMute, onSolo, onRemove }: Props) {
  const pill = (on: boolean, tone: string) =>
    `h-5 w-5 rounded text-[10px] font-semibold ${on ? tone : 'bg-muted text-muted-foreground hover:bg-accent'}`;
  return (
    <div
      data-testid="track-row"
      data-active={active}
      onPointerDown={onSelect}
      style={{ height: TRACK_ROW_H, borderLeftColor: track.color }}
      className={`flex items-center gap-1.5 border-b border-l-4 border-border px-2 ${active ? 'bg-accent/60' : 'hover:bg-accent/30'}`}
    >
      <input
        type="color"
        aria-label={`${track.name || 'Track'} colour`}
        value={track.color}
        onChange={(e) => onColor(e.target.value)}
        className="h-4 w-4 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <input
          aria-label="Track name"
          value={track.name}
          onChange={(e) => onName(e.target.value)}
          className="w-full min-w-0 bg-transparent text-xs font-medium text-foreground outline-none focus:underline"
        />
        <Popover
          label={`Instrument for ${track.name || 'track'}`}
          title="Choose an instrument"
          side="bottom"
          align="start"
          triggerClassName="truncate text-left text-[10px] text-muted-foreground hover:text-foreground"
          trigger={<span data-testid="track-instrument">{instrumentLabel(track)}</span>}
        >
          <div className="p-2">
            <GmInstrumentPicker value={instrumentOf(track)} onChange={onInstrument} />
          </div>
        </Popover>
      </div>
      <button
        type="button"
        aria-label={track.mixer.mute ? 'Unmute' : 'Mute'}
        aria-pressed={track.mixer.mute}
        onClick={() => onMute(!track.mixer.mute)}
        className={pill(track.mixer.mute, 'bg-amber-500 text-black')}
      >
        M
      </button>
      <button
        type="button"
        aria-label={track.mixer.solo ? 'Unsolo' : 'Solo'}
        aria-pressed={track.mixer.solo}
        onClick={() => onSolo(!track.mixer.solo)}
        className={pill(track.mixer.solo, 'bg-primary text-primary-foreground')}
      >
        S
      </button>
      <button type="button" aria-label="Remove track" onClick={onRemove} className="text-muted-foreground hover:text-destructive">
        <LuTrash2 className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
