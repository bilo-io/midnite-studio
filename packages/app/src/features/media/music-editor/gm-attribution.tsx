import { GM_ATTRIBUTION } from '@midnite/studio-shared';

/**
 * The licence and attribution notice for the General MIDI sample sets (Phase 101 Theme D). Mounted
 * in the Editor's about popover; CC BY 3.0 and MIT both require the credit to stay visible.
 */
export function GmAttribution() {
  return (
    <section aria-label="Instrument sample credits" className="flex max-w-xs flex-col gap-1.5 text-[11px] text-muted-foreground">
      <h4 className="text-xs font-semibold text-foreground">Instrument sounds</h4>
      <p>{GM_ATTRIBUTION.soundfont}</p>
      <p>{GM_ATTRIBUTION.samples}</p>
      <p className="break-all">
        {GM_ATTRIBUTION.url} · {GM_ATTRIBUTION.licenceUrl}
      </p>
      <p>The drum kit is synthesised in the app and carries no third-party samples.</p>
    </section>
  );
}
