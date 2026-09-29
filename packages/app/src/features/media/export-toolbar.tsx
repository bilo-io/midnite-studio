import { MEDIA_EXPORT_FORMAT_INFO, type MediaExportFormat } from '@midnite/studio-shared';
import { useRef, useState } from 'react';
import { LuChevronDown, LuDownload } from 'react-icons/lu';

import { ContextMenu, type MenuPosition } from '../../components/context-menu';
import { Tooltip } from '../../components/tooltip';
import { exportDisabledReason, useFfmpegStatus } from './use-media';

/**
 * The Media toolbar's export split button (Phase 99 Theme A): **Export** runs
 * the chosen format, the chevron picks another. Disabled — with the reason as
 * a tooltip — while nothing is selected or the format needs ffmpeg and it is
 * missing. Each tab passes its `MEDIA_TAB_EXPORT_FORMATS[tab]` and handles
 * `onExport` itself (ffmpeg formats through `useMediaExport`).
 */
export function ExportToolbar({
  formats,
  hasSelection,
  onExport,
  busy = false,
}: {
  formats: readonly MediaExportFormat[];
  hasSelection: boolean;
  onExport: (format: MediaExportFormat) => void;
  busy?: boolean;
}) {
  const ffmpeg = useFfmpegStatus();
  const [format, setFormat] = useState<MediaExportFormat>(formats[0]!);
  const [menu, setMenu] = useState<MenuPosition | null>(null);
  const chevron = useRef<HTMLButtonElement>(null);
  const current = formats.includes(format) ? format : formats[0]!;
  const reason = busy ? 'Exporting…' : exportDisabledReason(current, hasSelection, ffmpeg.data);

  const exportButton = (
    <button
      type="button"
      disabled={reason !== undefined}
      aria-label={`Export ${MEDIA_EXPORT_FORMAT_INFO[current].label}`}
      onClick={() => onExport(current)}
      className="flex h-7 items-center gap-1.5 rounded-l-md border border-border bg-card px-2 text-xs text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
    >
      <LuDownload aria-hidden className="h-3.5 w-3.5" />
      Export <span className="text-muted-foreground">{MEDIA_EXPORT_FORMAT_INFO[current].label}</span>
    </button>
  );

  return (
    <div className="ml-auto flex items-center">
      {reason ? (
        <Tooltip label={reason}>
          <span tabIndex={0} className="inline-flex">
            {exportButton}
          </span>
        </Tooltip>
      ) : (
        exportButton
      )}
      <button
        ref={chevron}
        type="button"
        aria-label="Export format"
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        onClick={() => {
          const rect = chevron.current?.getBoundingClientRect();
          setMenu(rect ? { x: rect.left, y: rect.bottom + 4 } : { x: 0, y: 0 });
        }}
        className="flex h-7 items-center rounded-r-md border border-l-0 border-border bg-card px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <LuChevronDown aria-hidden className="h-3.5 w-3.5" />
      </button>
      {menu ? (
        <ContextMenu
          position={menu}
          trigger={chevron}
          onClose={() => setMenu(null)}
          items={formats.map((f) => ({
            label: MEDIA_EXPORT_FORMAT_INFO[f].label,
            checked: f === current,
            checkKind: 'radio' as const,
            onSelect: () => setFormat(f),
          }))}
        />
      ) : null}
    </div>
  );
}
