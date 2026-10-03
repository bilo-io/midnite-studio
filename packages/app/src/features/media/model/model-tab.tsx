import { MEDIA_TAB_EXPORT_FORMATS, isModelPath, modelFileExtension, modelSidecarPath, parseModelSidecar, type MediaExportFormat } from '@midnite/studio-shared';
import { useState } from 'react';
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
import { LazyModelViewer } from './model-viewer-lazy';
import { modelFileUrl, mtlPathFor, viewerFormat } from './model-utils';
import type { ModelViewerStats } from './model-viewer';
import { useModelExport, useModelGeneration } from './use-model';

/** Where a Generate lands when the repo has no model project yet. */
export const DEFAULT_MODEL_PROJECT = 'generated';

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

  const onExport = (exportFormat: MediaExportFormat) => {
    if (!selectedPath || !activeProject || (exportFormat !== 'obj' && exportFormat !== 'fbx')) return;
    exporter.mutate({ project: activeProject, path: selectedPath, format: exportFormat });
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
              <LazyModelViewer
                key={`${activeProject}/${selectedPath}`}
                url={modelFileUrl(repoId, activeProject, selectedPath)}
                format={format}
                mtlUrl={format === 'obj' && hasMtl ? modelFileUrl(repoId, activeProject, mtlPathFor(selectedPath)) : null}
                onStats={setStats}
              />
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
          {selectedPath && (design || stats) ? (
            <div className="flex shrink-0 flex-col gap-0.5 border-t border-border/50 px-3 py-1.5 text-[11px] text-muted-foreground" data-testid="model-caption">
              {design ? (
                <p className="truncate" title={design.prompt}>
                  <span className="font-medium text-foreground">{design.spec.name}</span>
                  {design.prompt ? ` — ${design.prompt}` : design.imageDescription ? ' — from an image' : ''}
                  <span className="ml-2 text-muted-foreground/70">{design.engine}</span>
                </p>
              ) : null}
              {stats ? (
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
