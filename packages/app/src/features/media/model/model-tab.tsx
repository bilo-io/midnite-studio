import { MEDIA_TAB_EXPORT_FORMATS, libraryParent, type ModelLibraryNode, modelFileExtension, modelSidecarPath, parseModelSidecar, type MediaExportFormat, type ModelSpec } from '@midnite/studio-shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { LuBox, LuSparkles } from 'react-icons/lu';
import { PiSparkleFill } from 'react-icons/pi';

import { EmptyState, EmptyStateButton } from '../../../components/empty-state';
import { Spinner } from '../../../components/skeleton';
import { bridge } from '../../../services/bridge';
import { useUiStore } from '../../../store/ui-store';
import { ExportToolbar } from '../export-toolbar';
import { MediaLayout, openMediaPane } from '../media-layout';
import { NoRepoMediaState } from '../repo-media-tab';
import { MEDIA_KEYS, useMediaFileText } from '../use-media';
import { ModelPanel } from './model-panel';
import { editorReducer, initialEditorState, isDirty } from './editor-state';
import { LazyModelEditor, LazyModelViewer } from './model-viewer-lazy';
import { JsonFileViewer } from './json-viewer';
import { collectModels, findNode, joinLibraryPath, splitProjectPath, type ModelSelection } from './library-tree';
import type { RetargetSource } from './clip-panel';
import { resolveCentre, selectionForGenerated } from './model-centre';
import { ModelExplorer } from './model-explorer';
import { modelFileUrl, mtlPathFor } from './model-utils';
import { useModelLibrary } from './use-model-library';
import type { ModelViewerStats } from './model-viewer';
import { useModelOpenRequest } from './use-model-agent-events';
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
  const [selection, setSelection] = useState<ModelSelection | null>(null);
  const [stats, setStats] = useState<ModelViewerStats | null>(null);
  const exportDir = useUiStore((s) => s.mediaExportDir);

  const library = useModelLibrary(repoId);
  const tree = library.data ?? [];
  const exporter = useModelExport(repoId, exportDir ?? null);
  const generation = useModelGeneration(repoId);

  // With nothing picked, show the newest model of the first group.
  const effective: ModelSelection | null = selection ?? newestModel(tree);
  const centre = resolveCentre(effective, tree);
  const activeProject = effective ? splitProjectPath(effective.path).project : (tree[0]?.name ?? null);
  const target = activeProject ?? DEFAULT_MODEL_PROJECT;

  // The 3D file the editor or viewer is on, as a path inside its project.
  const threeD = centre.kind === 'editor' || centre.kind === 'viewer' ? centre : null;
  const selectedPath = threeD?.path ?? null;
  const modelProject = threeD?.project ?? null;
  const format = selectedPath ? (modelFileExtension(selectedPath) ?? null) : null;
  const sidecar = useMediaFileText(repoId, 'model', modelProject, centre.kind === 'editor' && selectedPath ? modelSidecarPath(selectedPath) : null);
  const design = sidecar.data ? parseModelSidecar(sidecar.data) : null;
  const siblings = selectedPath && modelProject ? findNode(tree, joinLibraryPath(modelProject, libraryParent(selectedPath))) : null;
  const hasMtl = selectedPath && siblings?.kind === 'model' ? siblings.files.some((f) => f.name === mtlPathFor(selectedPath).split('/').pop()) : false;
  const generating = generation.pending.length > 0;
  const openModel = (next: ModelSelection) => {
    setStats(null);
    setSelection(next);
  };

  // The design being edited. It reloads when another file is opened, or when the saved sidecar
  // differs from what the editor last saved (a regeneration) — never because of its own Save.
  const fileKey = modelProject && selectedPath ? `${modelProject}/${selectedPath}` : '';
  const [editor, dispatch] = useReducer(editorReducer, undefined, () => initialEditorState(PLACEHOLDER_SPEC));
  const saver = useModelSaveEdit(repoId);
  const designSpec = design?.spec ?? null;

  // An agent is editing this model (an in-app iterative run, or an MCP session): adopt each edit as it lands.
  const client = useQueryClient();
  useEffect(() => {
    const off = bridge()?.media.model.onChanged((event) => {
      if (event.repoId !== repoId) return;
      dispatch({ type: 'external', spec: event.spec, source: `${event.project}/${event.path}`, saved: event.saved });
      void client.invalidateQueries({ queryKey: MEDIA_KEYS.tab(repoId, 'model') });
    });
    return () => off?.();
  }, [client, repoId]);

  // An iterative run names the model it is editing in its first progress event: show it from the start.
  const livePrimary = generation.pending.find((p) => p.primary);
  useEffect(() => {
    if (livePrimary?.primary) setSelection(selectionForGenerated(livePrimary.project, livePrimary.primary));
  }, [livePrimary?.generationId, livePrimary?.primary, livePrimary?.project]);

  // `model_open` from an agent.
  const openRequest = useModelOpenRequest((s) => s.request);
  useEffect(() => {
    if (!openRequest || openRequest.repoId !== repoId) return;
    setStats(null);
    setSelection(selectionForGenerated(openRequest.project, openRequest.path));
    useModelOpenRequest.getState().clear();
  }, [openRequest, repoId]);
  useEffect(() => {
    if (!designSpec || !fileKey) return;
    if (editor.source === fileKey && JSON.stringify(editor.saved) === JSON.stringify(designSpec)) return;
    if (editor.source === fileKey && isDirty(editor)) return;
    dispatch({ type: 'load', spec: designSpec, source: fileKey });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on a new design or file only
  }, [designSpec, fileKey]);
  const editing = designSpec !== null && editor.source === fileKey;

  // Rigged models with clips (their model.json says so) are what the Animation tab can copy clips from.
  const retargetSources = useMemo<RetargetSource[]>(() => {
    const out: RetargetSource[] = [];
    for (const model of (library.data ?? []).flatMap((node) => collectModels(node))) {
      const clips = model.manifest?.animations;
      const design = model.manifest?.files.design;
      if (!Array.isArray(clips) || clips.length === 0 || !design) continue;
      const { project, rest } = splitProjectPath(model.path);
      const path = joinLibraryPath(rest, design);
      if (`${project}/${path}` === `${modelProject}/${selectedPath ? modelSidecarPath(selectedPath) : ''}`) continue;
      out.push({
        key: `${project}/${path}`,
        label: model.manifest?.name ?? model.name,
        load: async () => {
          const read = await bridge()?.media.file.read({ repoId, tab: 'model', project, path });
          return read?.ok ? (parseModelSidecar(read.value)?.spec ?? null) : null;
        },
      });
    }
    return out;
  }, [library.data, repoId, modelProject, selectedPath]);
  const sidecarMissing = centre.kind === 'viewer' || sidecar.isError || (sidecar.isSuccess && design === null);

  const onExport = (exportFormat: MediaExportFormat) => {
    if (!selectedPath || !modelProject || (exportFormat !== 'obj' && exportFormat !== 'fbx')) return;
    // Unsaved edits export too: the edited spec rides along.
    exporter.mutate({ project: modelProject, path: selectedPath, format: exportFormat, ...(editing ? { spec: editor.spec } : {}) });
  };

  const save = () => {
    if (!modelProject || !selectedPath) return;
    saver.mutate(
      { project: modelProject, path: selectedPath, spec: editor.spec },
      { onSuccess: (result) => result.ok && dispatch({ type: 'markSaved' }) },
    );
  };

  return (
    <MediaLayout
      tab="model"
      detailLabel="Resize prompt panel"
      toggleTop="top-11"
      toolbar={
        <ExportToolbar
          formats={MEDIA_TAB_EXPORT_FORMATS.model}
          hasSelection={selectedPath !== null && modelProject !== null}
          onExport={onExport}
          busy={exporter.isPending}
        />
      }
      explorer={
        <ModelExplorer repoId={repoId} selection={effective} onSelect={openModel} />
      }
      content={
        <div className="relative flex h-full min-h-0 flex-col">
          <div className="relative min-h-0 flex-1">
            {centre.kind === 'json' ? (
              <JsonFileViewer key={`${centre.project}/${centre.path}`} repoId={repoId} project={centre.project} path={centre.path} />
            ) : centre.kind === 'image' ? (
              <div className="flex h-full items-center justify-center p-4">
                <img src={modelFileUrl(repoId, centre.project, centre.path)} alt={centre.path} className="max-h-full max-w-full object-contain" />
              </div>
            ) : centre.kind === 'unsupported' ? (
              <EmptyState icon={LuBox} title="No preview" body={`${centre.path} is not a 3D, JSON or image file.`} />
            ) : modelProject && selectedPath && format ? (
              editing ? (
                <LazyModelEditor state={editor} dispatch={dispatch} onSave={save} saving={saver.isPending} retargetSources={retargetSources} />
              ) : sidecarMissing ? (
                <LazyModelViewer
                  key={fileKey}
                  url={modelFileUrl(repoId, modelProject, selectedPath)}
                  format={format}
                  mtlUrl={format === 'obj' && hasMtl ? modelFileUrl(repoId, modelProject, mtlPathFor(selectedPath)) : null}
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
                <Spinner />{' '}
                {livePrimary?.iteration
                  ? `Pass ${livePrimary.iteration.n} of ${livePrimary.iteration.max}${livePrimary.action ? ` · ${livePrimary.action}` : ''}`
                  : 'Designing your model…'}
              </span>
            </div>
          ) : null}
        </div>
      }
      detail={
        <ModelPanel
          repoId={repoId}
          project={target}
          onGenerated={(project, primary) => openModel(selectionForGenerated(project, primary))}
        />
      }
    />
  );
}

/** With nothing picked: the newest model across the tree. */
function newestModel(tree: readonly ModelLibraryNode[]): ModelSelection | null {
  let best: { path: string; mtimeMs: number } | null = null;
  const walk = (nodes: readonly ModelLibraryNode[]) => {
    for (const node of nodes) {
      if (node.kind === 'group') walk(node.children);
      else if (!best || node.mtimeMs > best.mtimeMs) best = { path: node.path, mtimeMs: node.mtimeMs };
    }
  };
  walk(tree);
  const found = best as { path: string; mtimeMs: number } | null;
  return found ? { kind: 'model', path: found.path } : null;
}
