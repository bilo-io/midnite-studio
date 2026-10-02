import {
  imageSidecarPath,
  isImagePath,
  MEDIA_ROOT_DIR,
  MEDIA_TAB_EXPORT_FORMATS,
  mstudioFileUrl,
  type MediaExportFormat,
} from '@midnite/studio-shared';
import { useMemo, useReducer, useState } from 'react';
import { LuImage, LuSparkles } from 'react-icons/lu';

import { useDialogs } from '../../../components/dialog-host';
import { EmptyState, EmptyStateButton } from '../../../components/empty-state';
import { previewKindForFile } from '../../../lib/languages';
import { useRepoFiles } from '../../../services/queries';
import { useUiStore } from '../../../store/ui-store';
import { ExportToolbar } from '../export-toolbar';
import { MediaLayout, openMediaPane } from '../media-layout';
import { MediaProjectsAccordion, type MediaSelection } from '../media-projects-accordion';
import { NoRepoMediaState } from '../repo-media-tab';
import { revealMedia, useMediaExport, useMediaFiles, useMediaMutations, useMediaProjects } from '../use-media';
import { CreatePanel } from './create-panel';
import { createPanelReducer, initialCreateState } from './create-panel-state';
import { Lightbox } from './lightbox';
import { MasonryGallery, type GalleryImage } from './masonry-gallery';
import { useImageGeneration, useImagePrefs, useImageProviders } from './use-images';

/** Where a Generate lands when the repo has no image project yet. */
export const DEFAULT_IMAGE_PROJECT = 'generated';

/**
 * Media ▸ Images (Phase 99 Theme C): images-only explorer on the left, a
 * masonry gallery led by the "+" tile in the centre, and the create panel on
 * the right. Generation runs in main; files land under
 * `.midnite/media/image/<project>/` with a `<name>.json` sidecar each.
 */
export function ImageTab() {
  const repoId = useUiStore((s) => s.selectedRepoId);
  if (!repoId) return <NoRepoMediaState tab="image" />;
  return <ImageTabBody repoId={repoId} />;
}

function ImageTabBody({ repoId }: { repoId: string }) {
  const [selection, setSelection] = useState<MediaSelection | null>(null);
  const [allInRepo, setAllInRepo] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [quality, setQuality] = useState(85);
  const prefs = useImagePrefs();
  const [form, dispatch] = useReducer(createPanelReducer, undefined, () =>
    initialCreateState(prefs.provider, prefs.model),
  );

  const projects = useMediaProjects(repoId, 'image');
  const activeProject = selection?.project ?? projects.data?.[0]?.name ?? null;
  const files = useMediaFiles(repoId, 'image', allInRepo ? null : activeProject);
  const repoFiles = useRepoFiles(repoId, null, undefined, { enabled: allInRepo });
  const providers = useImageProviders();
  const generation = useImageGeneration(repoId);
  const mutations = useMediaMutations(repoId, 'image');
  const exporter = useMediaExport();
  const dialogs = useDialogs();

  const images = useMemo<GalleryImage[]>(() => {
    if (allInRepo) {
      return (repoFiles.data?.files ?? [])
        .filter((path) => previewKindForFile(path) === 'image')
        .map((path) => ({ key: `repo:${path}`, project: null, path, url: mstudioFileUrl('repo', repoId, path) }));
    }
    if (!activeProject) return [];
    return [...(files.data ?? [])]
      .filter((file) => isImagePath(file.path))
      .sort((a, b) => b.mtimeMs - a.mtimeMs || b.path.localeCompare(a.path))
      .map((file) => ({
        key: `${activeProject}/${file.path}`,
        project: activeProject,
        path: file.path,
        url: mstudioFileUrl('repo', repoId, `${MEDIA_ROOT_DIR}/image/${activeProject}/${file.path}`),
      }));
  }, [allInRepo, repoFiles.data, files.data, activeProject, repoId]);

  const selectedKey =
    lightbox !== null
      ? (images[lightbox]?.key ?? null)
      : selection?.path && activeProject
        ? `${activeProject}/${selection.path}`
        : null;
  const exportTarget = lightbox !== null ? images[lightbox] : images.find((image) => image.key === selectedKey);

  const target = activeProject ?? DEFAULT_IMAGE_PROJECT;
  const pendingCount = allInRepo
    ? 0
    : generation.pending.filter((p) => p.project === target).reduce((sum, p) => sum + (p.total - p.completed), 0);

  const onGenerate = () =>
    generation.generate.mutate({
      project: target,
      prompt: form.prompt.trim(),
      provider: form.provider,
      model: form.model,
      aspect: form.aspect,
      count: form.count,
    });

  const onExport = (format: MediaExportFormat) => {
    if (!exportTarget?.project) return;
    exporter.start.mutate({
      source: { kind: 'media', repoId, tab: 'image', project: exportTarget.project, path: exportTarget.path },
      format,
      options: format === 'jpeg' || format === 'webp' ? { quality } : {},
    });
  };

  const onDelete = (image: GalleryImage) => {
    if (!image.project) return;
    const project = image.project;
    dialogs.confirm({
      title: `Delete ${image.path}?`,
      body: 'Moves the image and its metadata sidecar to the Trash.',
      confirmLabel: 'Move to Trash',
      danger: true,
      onConfirm: () => {
        setLightbox(null);
        mutations.removeFile.mutate({ project, path: image.path });
        mutations.removeFile.mutate({ project, path: imageSidecarPath(image.path) });
      },
    });
  };

  const statuses = providers.data ?? [];
  const running = generation.pending.length > 0;

  return (
    <>
      <MediaLayout
        tab="image"
        detailLabel="Resize create panel"
        toolbar={
          <>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              JPEG/WebP quality
              <input
                type="range"
                min={1}
                max={100}
                value={quality}
                onChange={(event) => setQuality(Number(event.target.value))}
                aria-label="Export quality"
                className="w-24 accent-primary"
              />
              <span className="w-6 tabular-nums">{quality}</span>
            </label>
            <ExportToolbar
              formats={MEDIA_TAB_EXPORT_FORMATS.image}
              hasSelection={exportTarget?.project != null}
              onExport={onExport}
              busy={exporter.progress?.status === 'running'}
            />
          </>
        }
        explorer={
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1">
              <MediaProjectsAccordion
                repoId={repoId}
                tab="image"
                selection={selection}
                onSelect={(next) => {
                  setAllInRepo(false);
                  setSelection(next);
                }}
                fileFilter={isImagePath}
              />
            </div>
            <label className="flex h-8 shrink-0 items-center gap-2 border-t border-border px-2 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={allInRepo}
                onChange={(event) => setAllInRepo(event.target.checked)}
                className="accent-primary"
              />
              All images in repo
            </label>
          </div>
        }
        content={
          images.length === 0 && pendingCount === 0 ? (
            <EmptyState
              icon={LuImage}
              title="No images yet"
              body="Describe what you want in the create panel and generate your first image."
              action={<EmptyStateButton icon={LuSparkles} label="Generate image" onClick={() => openMediaPane('image', 'detail')} />}
            />
          ) : (
          <MasonryGallery
            images={images}
            pendingCount={pendingCount}
            selectedKey={selectedKey}
            onCreate={() => openMediaPane('image', 'detail')}
            onOpen={setLightbox}
          />
          )
        }
        detail={
          <CreatePanel
            state={form}
            dispatch={dispatch}
            statuses={statuses}
            running={running}
            error={generation.lastError}
            onGenerate={onGenerate}
            onCancel={generation.cancelAll}
            onPick={prefs.setDefault}
          />
        }
      />
      {lightbox !== null && images[lightbox] ? (
        <Lightbox
          images={images}
          index={lightbox}
          repoId={repoId}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
          onRerun={(sidecar) => {
            dispatch({ type: 'rerun', sidecar });
            setLightbox(null);
            openMediaPane('image', 'detail');
          }}
          onReveal={(image) => image.project && revealMedia(repoId, 'image', image.project, image.path)}
          onDelete={onDelete}
        />
      ) : null}
    </>
  );
}
