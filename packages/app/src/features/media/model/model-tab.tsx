import { MEDIA_TAB_EXPORT_FORMATS, isModelPath, modelFileExtension, modelSidecarPath, parseModelSidecar, type MediaExportFormat, type ModelSpec } from '@midnite/studio-shared';
import { useEffect, useReducer, useState } from 'react';
import { LuBox, LuSparkles } from 'react-icons/lu';
import { PiSparkleFill } from 'react-icons/pi';

import { EmptyState, EmptyStateButton } from '../../../components/empty-state';
import { Spinner } from '../../../components/skeleton';
import { useUiStore } from '../../../store/ui-store';
import { ExportToolbar } from '../export-toolbar';
import { MediaLayout, openMediaPane } from '../media-layout';
import { MediaProjectsAccordion, type MediaSelection } from '../media-projects-accordion';
import { NoRepoMediaState } from '../repo-media-tab';
import { useMediaFiles, useMediaFileText, useMediaProjects } from '../use-media';
import { ModelPanel } from './model-panel';
import { editorReducer, initialEditorState, isDirty } from './editor-state';
import { LazyModelEditor, LazyModelViewer } from './model-viewer-lazy';
import { modelFileUrl, mtlPathFor, viewerFormat } from './model-utils';
import type { ModelViewerStats } from './model-viewer';
import { useModelExport, useModelGeneration, useModelSaveEdit } from './use-model';

/** Where a Generate lands when the repo has no model project yet. */
export const DEFAULT_MODEL_PROJECT = 'generated';

/** Stands in until a design loads; the editor never shows it (`editor.source` gates that). */
const PLACEHOLDER_SPEC: ModelSpec = { name: 'model', parts: [{ name: 'part', shape: 'sphere', radius: 1, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#b0b0b0' }] };

/**
 * Media ▸ Models: an explorer of `.obj`/`.fbx` files on the left, an
 * interactive three.js viewer in the centre and the prompt panel on the right
 * (describe an object, or attach a picture of one). Generation runs in main
 * and lands `<name>.obj/.mtl/.fbx` plus a `<name>.json` design sidecar in
 * `.midnite/media/model/<project>/`.
 */
export function ModelTab() {
  const repoId = useUiStore((s) => s.selectedRepoId);
  if (!repoId) return <NoRepoMediaState tab="model" />;
  return <ModelTabBody repoId={repoId} />;
}

function ModelTabBody({ repoId }: { repoId: string }) {
  const [selection, setSelection] = useState<MediaSelection | null>(null);
  const [stats, setStats] = useState<ModelViewerStats | null>(null);
  const exportDir = useUiStore((s) => s.mediaExportDir);

  const projects = useMediaProjects(repoId, 'model');
  const activeProject = selection?.project ?? projects.data?.[0]?.name ?? null;
  const files = useMediaFiles(repoId, 'model', activeProject);
  const exporter = useModelExport(repoId, exportDir ?? null);
  const generation = useModelGeneration(repoId);
  const target = activeProject ?? DEFAULT_MODEL_PROJECT;

  // With nothing picked, show the newest model of the active project.
  const modelFiles = [...(files.data ?? [])].filter((f) => isModelPath(f.path)).sort((a, b) => b.mtimeMs - a.mtimeMs);
  const selectedPath =
    selection?.path && isModelPath(selection.path) ? selection.path : (modelFiles.find((f) => f.path.endsWith('.obj')) ?? modelFiles[0])?.path ?? null;
  const format = selectedPath ? viewerFormat(selectedPath) : null;
  const sidecar = useMediaFileText(repoId, 'model', activeProject, selectedPath ? modelSidecarPath(selectedPath) : null);
  const design = sidecar.data ? parseModelSidecar(sidecar.data) : null;
  const hasMtl = selectedPath ? files.data?.some((f) => f.path === mtlPathFor(selectedPath)) === true : false;
  const generating = generation.pending.length > 0;

  // The design being edited. It reloads when another file is opened, or when the saved sidecar
  // differs from what the editor last saved (a regeneration) — never because of its own Save.
  const fileKey = activeProject && selectedPath ? `${activeProject}/${selectedPath}` : '';
  const [editor, dispatch] = useReducer(editorReducer, undefined, () => initialEditorState(PLACEHOLDER_SPEC));
  const saver = useModelSaveEdit(repoId);
  const designSpec = design?.spec ?? null;
  useEffect(() => {
    if (!designSpec || !fileKey) return;
    if (editor.source === fileKey && JSON.stringify(editor.saved) === JSON.stringify(designSpec)) return;
    if (editor.source === fileKey && isDirty(editor)) return;
    dispatch({ type: 'load', spec: designSpec, source: fileKey });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on a new design or file only
  }, [designSpec, fileKey]);
  const editing = designSpec !== null && editor.source === fileKey;
  const sidecarMissing = sidecar.isError || (sidecar.isSuccess && design === null);

  const onExport = (exportFormat: MediaExportFormat) => {
    if (!selectedPath || !activeProject || (exportFormat !== 'obj' && exportFormat !== 'fbx')) return;
    // Unsaved edits export too: the edited spec rides along.
    exporter.mutate({ project: activeProject, path: selectedPath, format: exportFormat, ...(editing ? { spec: editor.spec } : {}) });
  };

  const save = () => {
    if (!activeProject || !selectedPath) return;
    saver.mutate(
      { project: activeProject, path: selectedPath, spec: editor.spec },
      { onSuccess: (result) => result.ok && dispatch({ type: 'markSaved' }) },
    );
  };

  return (
    <MediaLayout
      tab="model"
      detailLabel="Resize prompt panel"
      toolbar={
        <ExportToolbar
          formats={MEDIA_TAB_EXPORT_FORMATS.model}
          hasSelection={selectedPath !== null && activeProject !== null}
          onExport={onExport}
          busy={exporter.isPending}
        />
      }
      explorer={
        <MediaProjectsAccordion
          repoId={repoId}
          tab="model"
          selection={selectedPath && activeProject ? { project: activeProject, path: selectedPath } : selection}
          onSelect={(next) => {
            setStats(null);
            setSelection(next);
          }}
          fileFilter={isModelPath}
        />
      }
      content={
        <div className="relative flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1">
            {activeProject && selectedPath && format ? (
              editing ? (
                <LazyModelEditor state={editor} dispatch={dispatch} onSave={save} saving={saver.isPending} />
              ) : sidecarMissing ? (
                <LazyModelViewer
                  key={fileKey}
                  url={modelFileUrl(repoId, activeProject, selectedPath)}
                  format={format}
                  mtlUrl={format === 'obj' && hasMtl ? modelFileUrl(repoId, activeProject, mtlPathFor(selectedPath)) : null}
                  onStats={setStats}
                />
              ) : (
                <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Spinner /> Opening model…
                </div>
              )
            ) : (
              <EmptyState
                icon={LuBox}
                title="No 3D models yet"
                body="Describe an object or attach a picture in the panel on the right, and generate your first model as .obj and .fbx."
                action={
                  <EmptyStateButton icon={LuSparkles} filledIcon={PiSparkleFill} label="Generate model" onClick={() => openMediaPane('model', 'detail')} />
                }
              />
            )}
          </div>
          {selectedPath && (design || (stats && !editing)) ? (
            <div className="flex shrink-0 flex-col gap-0.5 border-t border-border/50 px-3 py-1.5 text-[11px] text-muted-foreground" data-testid="model-caption">
              {design ? (
                <p className="truncate" title={design.prompt}>
                  <span className="font-medium text-foreground">{design.spec.name}</span>
                  {design.prompt ? ` — ${design.prompt}` : design.imageDescription ? ' — from an image' : ''}
                  <span className="ml-2 text-muted-foreground/70">{design.engine}</span>
                </p>
              ) : null}
              {editing ? (
                <p className="tabular-nums">
                  {editor.spec.parts.length} {editor.spec.parts.length === 1 ? 'part' : 'parts'}
                  {isDirty(editor) ? ' · unsaved changes' : ''}
                </p>
              ) : stats ? (
                <p className="tabular-nums">
                  {stats.meshes} {stats.meshes === 1 ? 'mesh' : 'meshes'} · {stats.triangles.toLocaleString()} triangles ·{' '}
                  {stats.size.map((n) => n.toFixed(2)).join(' × ')} ({modelFileExtension(selectedPath)})
                </p>
              ) : null}
            </div>
          ) : null}
          {generating ? (
            <div
              data-testid="model-generating"
              className="pointer-events-none absolute inset-0 flex items-start justify-center bg-background/40 pt-6 backdrop-blur-[1px]"
            >
              <span className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow">
                <Spinner /> Designing your model…
              </span>
            </div>
          ) : null}
        </div>
      }
      detail={
        <ModelPanel
          repoId={repoId}
          project={target}
          onGenerated={(project, primary) => {
            setStats(null);
            setSelection({ project, path: primary });
          }}
        />
      }
    />
  );
}
