import {
  AUDIO_MP3_BITRATES,
  MEDIA_AUDIO_EDITOR_EXPORT_FORMATS,
  type MediaExportFormat,
  type MusicExportFormat,
  type MusicExportRange,
  type MusicSendToGeneratorResult,
} from '@midnite/studio-shared';
import { useState } from 'react';
import { LuWand } from 'react-icons/lu';

import { bridge } from '../../../services/bridge';
import { noBridge, reportFailure } from '../../../services/bridge-result';
import { useUiStore } from '../../../store/ui-store';
import { ExportToolbar } from '../export-toolbar';
import { useEditorSession } from './editor-session';
import { exportSong, sendSongToGenerator, songHasNotes } from './song-export';

/**
 * The Editor's half of the Media toolbar (Phase 101 Themes J and K): Export (.mid / WAV / MP3) for
 * the whole song or the loop region, and Send to Generator. It exports whatever song the editor
 * currently publishes through `editor-session`, so it needs no knowledge of how songs are loaded.
 */
export function EditorExportBar({
  repoId,
  project,
  defaultBitrate,
  onSent,
}: {
  repoId: string;
  project: string | null;
  defaultBitrate: number;
  onSent: (project: string, result: MusicSendToGeneratorResult) => void;
}) {
  const { song, loopRegion } = useEditorSession();
  const exportDir = useUiStore((s) => s.mediaExportDir);
  const [range, setRange] = useState<MusicExportRange>('song');
  const [bitrate, setBitrate] = useState(defaultBitrate);
  const [busy, setBusy] = useState<'export' | 'send' | null>(null);
  const effectiveRange: MusicExportRange = range === 'loop' && loopRegion ? 'loop' : 'song';
  const target = project ?? 'imports';
  const ready = songHasNotes(song);

  const deps = () => {
    const b = bridge();
    return b ? { music: b.media.music, gm: b.media.audio } : null;
  };

  const onExport = async (format: MediaExportFormat) => {
    const d = deps();
    if (!d || !song) return void reportFailure(noBridge());
    setBusy('export');
    try {
      const result = await exportSong(d, {
        repoId,
        project: target,
        song,
        range: effectiveRange,
        loop: loopRegion,
        format: format as MusicExportFormat,
        bitrateKbps: bitrate,
        ...(exportDir ? { defaultDir: exportDir } : {}),
      });
      if (!(result.ok === false && result.kind === 'error' && result.message === 'cancelled')) reportFailure(result);
    } finally {
      setBusy(null);
    }
  };

  const onSend = async () => {
    const d = deps();
    if (!d || !song) return void reportFailure(noBridge());
    setBusy('send');
    try {
      const result = await sendSongToGenerator(d, { repoId, project: target, song, range: effectiveRange, loop: loopRegion });
      if (result.ok) onSent(target, result.value);
      else reportFailure(result);
    } finally {
      setBusy(null);
    }
  };

  const select = 'h-6 rounded-md border border-border bg-background px-1 text-[11px] text-foreground';
  return (
    <>
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        Range
        <select
          aria-label="Export range"
          value={effectiveRange}
          onChange={(event) => setRange(event.target.value as MusicExportRange)}
          className={select}
        >
          <option value="song">Whole song</option>
          <option value="loop" disabled={!loopRegion}>
            Loop region
          </option>
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        MP3 bitrate
        <select
          aria-label="MP3 bitrate"
          value={bitrate}
          onChange={(event) => setBitrate(Number(event.target.value))}
          className={select}
        >
          {AUDIO_MP3_BITRATES.map((kbps) => (
            <option key={kbps} value={kbps}>
              {kbps} kbps
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={!ready || busy !== null}
        title="Render the song and hand Generator a reference clip plus a description (key, tempo, instruments, mood)"
        onClick={() => void onSend()}
        className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        <LuWand aria-hidden className="h-3.5 w-3.5" />
        {busy === 'send' ? 'Sending…' : 'Send to Generator'}
      </button>
      <ExportToolbar
        formats={MEDIA_AUDIO_EDITOR_EXPORT_FORMATS}
        hasSelection={ready}
        onExport={(format) => void onExport(format)}
        busy={busy === 'export'}
      />
    </>
  );
}
