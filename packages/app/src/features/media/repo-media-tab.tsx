import {
  MEDIA_EXPORT_FORMAT_INFO,
  MEDIA_TAB_EXPORT_FORMATS,
  type MediaExportFormat,
  type MediaTab,
} from '@midnite/studio-shared';
import { useState } from 'react';
import { LuFolderGit2 } from 'react-icons/lu';

import { EmptyState } from '../../components/empty-state';
import { useUiStore } from '../../store/ui-store';
import { ExportToolbar } from './export-toolbar';
import { MediaLayout } from './media-layout';
import { MediaProjectsAccordion, type MediaSelection } from './media-projects-accordion';
import { MEDIA_TAB_META } from './media-tabs';
import { useMediaExport } from './use-media';

/**
 * Shared "Open a repo" state for the repo-scoped tabs (Docs, Images, Audio).
 * Video does not use it — it resolves a global root (Theme D).
 */
export function NoRepoMediaState({ tab }: { tab: MediaTab }) {
  return (
    <EmptyState
      icon={LuFolderGit2}
      title="Open a repo"
      body={`${MEDIA_TAB_META[tab].label} live in the open repo's .midnite/media/${tab}/ folder.`}
    />
  );
}

/**
 * The baseline body of a storage-backed tab (Phase 99 Theme A) — projects
 * accordion, a selection placeholder, and the export toolbar wired to the
 * ffmpeg service. Themes B (Docs), C (Images) and E (Audio) replace their own
 * tab's use of this with a real editor / gallery / session built on the same
 * `MediaLayout` slots.
 */
export function RepoMediaTab({ tab }: { tab: MediaTab }) {
  const repoId = useUiStore((s) => s.selectedRepoId);
  const [selection, setSelection] = useState<MediaSelection | null>(null);
  const exporter = useMediaExport();

  if (!repoId) return <NoRepoMediaState tab={tab} />;

  const hasFile = selection?.path != null;
  const onExport = (format: MediaExportFormat) => {
    if (!selection?.path || !MEDIA_EXPORT_FORMAT_INFO[format].needsFfmpeg) return;
    exporter.start.mutate({
      source: { kind: 'media', repoId, tab, project: selection.project, path: selection.path },
      format,
    });
  };

  return (
    <MediaLayout
      tab={tab}
      toolbar={
        <ExportToolbar
          formats={MEDIA_TAB_EXPORT_FORMATS[tab]}
          hasSelection={hasFile}
          onExport={onExport}
          busy={exporter.progress?.status === 'running'}
        />
      }
      explorer={
        <MediaProjectsAccordion repoId={repoId} tab={tab} selection={selection} onSelect={setSelection} />
      }
      content={
        <EmptyState
          icon={MEDIA_TAB_META[tab].icon}
          title={hasFile ? selection.path! : `Select a ${MEDIA_TAB_META[tab].label.toLowerCase()} file`}
          body={hasFile ? `In ${selection.project}` : 'Pick a project on the left, or create one.'}
        />
      }
      detail={<EmptyState title="Nothing selected" body="Details for the selection appear here." />}
    />
  );
}
