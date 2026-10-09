import { MEDIA_TAB_EXPORT_FORMATS, type DocExportFormat, type MediaExportFormat } from '@midnite/studio-shared';
import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import { LuFilePlus, LuFileText } from 'react-icons/lu';
import { PiFilePlusFill } from 'react-icons/pi';

import { EmptyState, EmptyStateButton } from '../../../components/empty-state';
import { bridge } from '../../../services/bridge';
import { noBridge, reportFailure } from '../../../services/bridge-result';
import { useToastStore } from '../../../store/toast-store';
import { useUiStore } from '../../../store/ui-store';
import { ExportToolbar } from '../export-toolbar';
import { MediaLayout } from '../media-layout';
import type { MediaSelection } from '../media-projects-accordion';
import { NoRepoMediaState } from '../repo-media-tab';
import type { DocEditorHandle } from './doc-editor';
import { DocThreadPanel } from './doc-thread-panel';
import { DocsExplorer } from './docs-explorer';
import { useDocSession, type DocRef } from './use-doc-session';

/**
 * Media ▸ Docs (Phase 99 Theme B): project accordion, the Tiptap editor over
 * plain `.md`, and the doc's AI thread, on the shared `MediaLayout` frame.
 *
 * **The lazy boundary is here.** This module and everything it imports
 * eagerly carry no Tiptap: the editor (`doc-editor.tsx`, with ProseMirror and
 * lowlight) loads as its own chunk the first time a doc opens, and the export
 * HTML builder (react-dom/server) only when exporting. `docs-tab.test.ts`
 * asserts the boundary.
 */
export const loadDocEditor = () => import('./doc-editor');
const DocEditor = lazy(loadDocEditor);

export function DocsTab() {
  const repoId = useUiStore((s) => s.selectedRepoId);
  const exportDir = useUiStore((s) => s.mediaExportDir);
  const [selection, setSelection] = useState<MediaSelection | null>(null);
  const [aiSelection, setAiSelection] = useState<string | undefined>(undefined);
  const [focusToken, setFocusToken] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [createRequest, setCreateRequest] = useState(0);
  const handle = useRef<DocEditorHandle | null>(null);

  const doc: DocRef | null =
    repoId && selection?.path ? { repoId, project: selection.project, path: selection.path } : null;
  const session = useDocSession(doc);
  const setLastDoc = useUiStore((s) => s.setMediaLastDoc);
  // "Last edited" is by edit, not selection: only a real change records it.
  const onEdit = useCallback(
    (text: string) => {
      if (doc && text !== session.draft) setLastDoc(doc.repoId, { project: doc.project, path: doc.path });
      session.edit(text);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `session.edit`/`draft` change with `doc`.
    [doc?.repoId, doc?.project, doc?.path, session.draft, session.edit, setLastDoc],
  );
  const onReady = useCallback((h: DocEditorHandle | null) => {
    handle.current = h;
  }, []);
  const onAskAi = useCallback((sel: string | undefined) => {
    setAiSelection(sel);
    setFocusToken((n) => n + 1);
  }, []);

  if (!repoId) return <NoRepoMediaState tab="doc" />;

  const onExport = async (format: MediaExportFormat) => {
    if (!doc || !session.ready) return;
    const name = doc.path.split('/').pop() ?? doc.path;
    setExporting(true);
    try {
      const content =
        format === 'md'
          ? session.draft
          : (await import('./doc-export-html')).buildDocHtml(name.replace(/\.md$/i, ''), session.draft);
      const result =
        (await bridge()?.media.doc.export({
          format: format as DocExportFormat,
          name,
          content,
          ...(exportDir ? { defaultDir: exportDir } : {}),
        })) ?? noBridge<{ dest: string }>();
      if (result.ok) useToastStore.getState().addToast({ message: `Exported ${result.value.dest}`, status: 'success' });
      else if (!(result.kind === 'error' && result.message === 'cancelled')) reportFailure(result);
    } finally {
      setExporting(false);
    }
  };

  return (
    <MediaLayout
      tab="doc"
      toolbar={
        <ExportToolbar
          formats={MEDIA_TAB_EXPORT_FORMATS.doc}
          hasSelection={doc !== null && session.ready}
          onExport={(format) => void onExport(format)}
          busy={exporting}
        />
      }
      explorer={
        <DocsExplorer
          repoId={repoId}
          selection={selection}
          createRequest={createRequest}
          onSelect={(next) => {
            setSelection(next);
            setAiSelection(undefined);
          }}
        />
      }
      content={
        !doc ? (
          <EmptyState
            icon={LuFileText}
            title="No doc open"
            body="Pick a doc on the left, or start a new one."
            action={<EmptyStateButton icon={LuFilePlus} filledIcon={PiFilePlusFill} label="New doc" onClick={() => setCreateRequest((n) => n + 1)} />}
          />
        ) : session.error ? (
          <EmptyState title="Could not open this doc" body={session.error} />
        ) : !session.ready ? (
          <p className="p-4 text-xs text-muted-foreground">Loading…</p>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            {session.conflict ? (
              <div
                role="status"
                className="flex shrink-0 items-center gap-2 border-b border-border bg-amber-500/10 px-3 py-1.5 text-xs"
              >
                <span>This doc changed on disk while you have unsaved edits.</span>
                <button type="button" onClick={session.reload} className="ml-auto rounded px-2 py-0.5 hover:bg-accent">
                  Reload
                </button>
                <button type="button" onClick={session.keepMine} className="rounded px-2 py-0.5 hover:bg-accent">
                  Keep mine
                </button>
              </div>
            ) : null}
            <div className="min-h-0 flex-1">
              <Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Loading editor…</p>}>
                <DocEditor
                  key={`${doc.project}/${doc.path}#${session.nonce}`}
                  markdown={session.draft}
                  onChange={onEdit}
                  onReady={onReady}
                  onAskAi={onAskAi}
                />
              </Suspense>
            </div>
          </div>
        )
      }
      detail={
        <DocThreadPanel
          doc={doc}
          session={session}
          selection={aiSelection}
          onClearSelection={() => setAiSelection(undefined)}
          getMarkdown={() => session.draft}
          focusToken={focusToken}
        />
      }
    />
  );
}
