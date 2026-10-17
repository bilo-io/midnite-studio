import { useEffect } from 'react';

import type { VideoHost, VideoStudioViewProps } from '@midnite/studio-feature-media-video/renderer';

import { Modal } from '../components/modal';
import { LoadingRegion, Skeleton, Spinner } from '../components/skeleton';
import { TreeSection } from '../components/tree-section';
import { useBrowserBounds } from '@midnite/studio-feature-browser/renderer';
import { FileIcon, FolderIcon } from '../features/files/file-icons';
import { MarkdownPreview } from '../features/files/preview/markdown-preview';
import { VideoEditThread } from '../features/media/video/video-edit-thread';
import { useResolvedAgent, VideoSkillActions } from '../features/media/video/video-skill-actions';
import { submitCommand } from '../features/terminal/submit-command';
import { useTerminalStore } from '../features/terminal/terminal-store';
import { bridge } from '../services/bridge';
import { openInMidnite } from '../services/open-in-midnite';
import { useUiStore } from '../store/ui-store';

/**
 * Studio's side of the Video feature's host port (Phase 113 Theme Q).
 *
 * Everything Video reached into Studio for stays Studio's: the integrated terminal (`npm install`,
 * the ffmpeg install, the assets sync), the embedded browser that hosts the engine's studio, the
 * agent roster behind the Edit thread and the editorial skills, the Files markdown preview, and
 * the last project / panel tab in `ui-store` (`mediaLastVideoProject`, `mediaVideoPanelTab`), so no
 * stored key moved.
 *
 * Installed by Studio's Media view (`features/media/media-view.tsx`), not by `StudioProviders`,
 * for the same entry-chunk reason as the Docs host.
 */

/**
 * Keyed by project id — one `WebContentsView` per hosted studio, never reused across projects. A
 * Phase 99 project id is a path (`brand/category/NNN`), so its slashes are flattened out of the tab id.
 */
export function studioTabId(projectId: string): string {
  return `video-studio-${projectId.replaceAll('/', '__')}`;
}

/**
 * The running studio, in a `WebContentsView` — `browser-pane.tsx`'s own lifecycle scoped to this one
 * tab id rather than the multi-tab browser store. The view is created the instant a URL is known
 * (again when the composition deep link changes), and torn down when the studio stops, the project
 * changes or the pane unmounts.
 */
function StudioView({ projectId, url }: VideoStudioViewProps) {
  const tabId = studioTabId(projectId);
  const { ref, sync } = useBrowserBounds(tabId, true);

  useEffect(() => {
    void bridge()
      ?.browser.create({ tabId, url })
      .then(() => sync());
  }, [tabId, url, sync]);

  useEffect(
    () => () => {
      bridge()?.browser.close({ tabId });
    },
    [tabId],
  );

  return <div ref={ref} className="min-h-0 flex-1" />;
}

function EditThread({ projectId, title, cwd }: { projectId: string; title: string; cwd: string | null }) {
  const repoId = useUiStore((s) => s.selectedRepoId);
  const agent = useResolvedAgent();
  return <VideoEditThread projectId={projectId} title={title} cwd={cwd} repoId={repoId ?? null} agent={agent} />;
}

function usePanelTab() {
  const tab = useUiStore((s) => s.mediaVideoPanelTab);
  const setTab = useUiStore((s) => s.setMediaVideoPanelTab);
  return [tab, setTab] as const;
}

export const STUDIO_VIDEO_HOST = {
  getLastProject: (repoId) => useUiStore.getState().mediaLastVideoProject[repoId],
  setLastProject: (repoId, projectId) => useUiStore.getState().setMediaLastVideoProject(repoId, projectId),
  usePanelTab,
  runInTerminal: ({ title, command, cwd }) => {
    // Without a directory the command is the app's "run this in a pty" primitive: it submits.
    if (cwd === undefined) {
      submitCommand(command, title);
      return;
    }
    // With one it is typed ahead for the person to confirm — `npm install` in a fresh workspace.
    const repoId = useUiStore.getState().selectedRepoId;
    if (!repoId) return;
    useUiStore.getState().setTerminalOpen(true);
    const session = useTerminalStore.getState().openSession({ kind: 'shell', title, cwd, repoId });
    useTerminalStore.getState().queueInput(session.id, command);
  },
  StudioView,
  // Forced in-app (Phase 71 Theme B): a Remotion studio on localhost is the one link in the app whose
  // entire point is the embedded pane, regardless of the stored link-target preference.
  openStudioInTab: (url) => openInMidnite(url, { target: 'in-app' }),
  EditThread,
  SkillActions: VideoSkillActions,
  chrome: { Modal, MarkdownPreview, TreeSection, FileIcon, FolderIcon, LoadingRegion, Skeleton, Spinner },
} satisfies VideoHost;
