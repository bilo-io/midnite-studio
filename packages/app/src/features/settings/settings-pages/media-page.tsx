import { Accordion } from '@bilo-io/ui';
import { FFMPEG_INSTALL_COMMAND } from '@midnite/studio-shared';
import { LuAudioLines, LuClapperboard, LuFolderOpen, LuGamepad2, LuImage, LuMap, LuSettings2, LuX } from 'react-icons/lu';

import { bridge } from '../../../services/bridge';
import { useUiStore } from '../../../store/ui-store';
import { AudioSettingsSection } from '../../media/audio/audio-settings';
import { ImageSettingsSection } from '../../media/image/image-settings';
import { MapSettingsSection } from '../../media/map/map-settings';
import { useFfmpegStatus } from '../../media/use-media';
import { submitCommand } from '../../terminal/submit-command';
import { GamesRootSection } from './games-root-section';
import { VideoRootSection } from './video-root-section';

/**
 * Settings ▸ Media (Phase 99 Theme A) — replaced Settings ▸ Video; a
 * persisted `settingsPage: 'video'` migrates here (ui-store v29).
 *
 * - **General**: ffmpeg status (+ Install, typed into a visible terminal —
 *   never run headless) and the export default folder (`mediaExportDir`).
 * - **Video**: Phase 44's video root, unchanged.
 * - **Images** (Theme C): default provider/model and API keys (`ImageSettingsSection`).
 * - **Audio** (Theme E): prompt-form defaults and the MP3 bitrate (`AudioSettingsSection`).
 * - **Maps** (Phase 108 Theme B): the optional MapTiler key and the tile cache (`MapSettingsSection`).
 * - **Games** (Phase 107 Theme A): the games location, default engine and network (`GamesRootSection`).
 */
export function MediaSettingsPage() {
  return (
    <div className="flex flex-col gap-3">
      <Accordion title="General" icon={<LuSettings2 className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <FfmpegRow />
          <ExportFolderRow />
        </div>
      </Accordion>
      <Accordion title="Video" icon={<LuClapperboard className="h-4 w-4" />} defaultOpen>
        <VideoRootSection />
      </Accordion>
      <Accordion title="Images" icon={<LuImage className="h-4 w-4" />}>
        <ImageSettingsSection />
      </Accordion>
      <Accordion title="Audio" icon={<LuAudioLines className="h-4 w-4" />}>
        <AudioSettingsSection />
      </Accordion>
      <Accordion title="Maps" icon={<LuMap className="h-4 w-4" />}>
        <MapUnitsRow />
        <MapSettingsSection />
      </Accordion>
      <Accordion title="Games" icon={<LuGamepad2 className="h-4 w-4" />}>
        <GamesRootSection />
      </Accordion>
    </div>
  );
}

function FfmpegRow() {
  const ffmpeg = useFfmpegStatus();
  const status = ffmpeg.data;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-foreground">ffmpeg</p>
      <p className="text-[11px] text-muted-foreground">
        Every image, video and audio export is transcoded by ffmpeg. It is an external tool — Midnite
        does not bundle it.
      </p>
      <div className="flex items-center gap-2 text-xs">
        {status?.found ? (
          <span className="truncate font-mono text-foreground" data-testid="ffmpeg-path">
            {status.path}
          </span>
        ) : (
          <>
            <span className="text-muted-foreground">{status ? status.reason : 'Checking…'}</span>
            <button
              type="button"
              onClick={() => submitCommand(FFMPEG_INSTALL_COMMAND, 'ffmpeg install')}
              className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground hover:bg-accent"
            >
              Install
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => void ffmpeg.refetch()}
          className="rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Re-check
        </button>
      </div>
    </div>
  );
}

function ExportFolderRow() {
  const mediaExportDir = useUiStore((s) => s.mediaExportDir);
  const setMediaExportDir = useUiStore((s) => s.setMediaExportDir);

  const choose = async () => {
    const path = await bridge()?.repos.pickDirectory();
    if (path) setMediaExportDir(path);
  };

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-foreground">Export folder</p>
      <p className="text-[11px] text-muted-foreground">Where the export save dialog starts.</p>
      {mediaExportDir ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
          <span className="flex-1 truncate font-mono text-foreground">{mediaExportDir}</span>
          <button
            type="button"
            onClick={() => setMediaExportDir(null)}
            aria-label="Clear export folder"
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <LuX aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">System default.</p>
      )}
      <button
        type="button"
        onClick={() => void choose()}
        className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-accent"
      >
        <LuFolderOpen aria-hidden className="h-3.5 w-3.5" />
        {mediaExportDir ? 'Change folder…' : 'Choose folder…'}
      </button>
    </div>
  );
}

/** Settings ▸ Media ▸ Maps ▸ Units (Phase 108 Theme G): how the measure tools print distance and area. */
function MapUnitsRow() {
  const mapUnits = useUiStore((s) => s.mapUnits);
  const setMapUnits = useUiStore((s) => s.setMapUnits);
  return (
    <label className="flex items-center justify-between gap-3 px-3 pt-3 text-xs text-foreground">
      <span>Measurement units</span>
      <select
        aria-label="Map measurement units"
        value={mapUnits}
        onChange={(event) => setMapUnits(event.target.value === 'imperial' ? 'imperial' : 'metric')}
        className="rounded-md border border-border bg-background px-2 py-1 text-xs"
      >
        <option value="metric">Metric (m, km)</option>
        <option value="imperial">Imperial (ft, mi)</option>
      </select>
    </label>
  );
}
