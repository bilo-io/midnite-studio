import { useState } from 'react';

import { GmAttribution } from './gm-attribution';
import { GmInstrumentPicker, type GmSelection } from './gm-instrument-picker';

/**
 * Settings ▸ Media ▸ Audio ▸ General MIDI instruments (Phase 101 Theme D): browse the 128 GM
 * programs, download the ones the Editor will use ahead of time, and read the sample credits. The
 * Editor's own per-track picker (Theme E) uses the same {@link GmInstrumentPicker}.
 */
export function GmInstrumentLibrary() {
  const [selection, setSelection] = useState<GmSelection>({ kind: 'program', program: 0 });
  return (
    <div className="flex flex-col gap-2" data-testid="gm-instrument-library">
      <div>
        <h3 className="text-xs font-semibold text-foreground">General MIDI instruments</h3>
        <p className="text-xs text-muted-foreground">
          The Music editor plays each instrument from sampled sounds, downloaded the first time it is used and kept on this
          machine. Download ahead of time to work offline; an instrument that is missing plays as a plain synth.
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <GmInstrumentPicker value={selection} onChange={setSelection} />
        <GmAttribution />
      </div>
    </div>
  );
}
