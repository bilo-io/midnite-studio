import { MEDIA_TAB_EXPORT_FORMATS, type MediaExportFormat } from '@midnite/studio-shared';
import { useState } from 'react';

import { bridge, noBridge, reportFailure, useMediaKit } from '@midnite/studio-frame';

import { useNotify } from './chrome';
import { useGameHost } from './host';

/**
 * The Games toolbar's export (Phase 107 Theme P): the shared split button with the single HTML file
 * first, then the zip and the static folder. A file format asks for its path with the native save
 * dialog (in main); a folder asks for its parent with the directory picker and main refuses an
 * existing `<name>-web/`. The result is a transient toast; size warnings come back with it and get a toast of their own.
 */
export function GameExportBar({ gameId }: { gameId: string | null }) {
  const { ExportToolbar } = useMediaKit();
  const { pickDirectory } = useGameHost();
  const notify = useNotify();
  const [busy, setBusy] = useState(false);

  const onExport = async (format: MediaExportFormat) => {
    if (!gameId || (format !== 'game-html' && format !== 'game-zip' && format !== 'game-folder')) return;
    const api = bridge()?.games;
    let dest: string | undefined;
    if (format === 'game-folder') {
      const picked = await pickDirectory?.();
      if (!picked) return;
      dest = picked;
    }
    setBusy(true);
    try {
      const result = api ? await api.export({ gameId, format, ...(dest ? { dest } : {}) }) : noBridge<never>();
      if (!result.ok) {
        if (result.kind === 'error' && result.message !== 'cancelled') reportFailure(result);
        return;
      }
      const { path, warnings } = result.value;
      notify(`Exported to ${path}`);
      for (const warning of warnings) notify(warning, { danger: true });
    } finally {
      setBusy(false);
    }
  };

  return <ExportToolbar formats={pickDirectory ? MEDIA_TAB_EXPORT_FORMATS.game : MEDIA_TAB_EXPORT_FORMATS.game.filter((f) => f !== 'game-folder')} hasSelection={gameId !== null} onExport={(f) => void onExport(f)} busy={busy} />;
}
