import {
  imageSidecarPath,
  isImagePath,
  MEDIA_ROOT_DIR,
  MEDIA_TAB_EXPORT_FORMATS,
  mstudioFileUrl,
  type MediaExportFormat,
} from '@midnite/studio-shared';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { LuImage, LuSparkles } from 'react-icons/lu';
import { PiSparkleFill } from 'react-icons/pi';

import { EmptyState, EmptyStateButton, useFrameChrome, useMediaKit, type MediaSelection, BrandSlider } from '@midnite/studio-frame';

import { BasicCreatePanel } from './basic-create-panel';
import { createPanelReducer, initialCreateState } from './create-panel-state';
import { useImagesHost } from './host';
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
  const { useMediaRepoId, NoRepoMediaState } = useMediaKit();
  const repoId = useMediaRepoId();
  if (!repoId) return <NoRepoMediaState tab="image" />;
  return <ImageTabBody repoId={repoId} />;
}

/** An app with no repository file list offers no "All images in repo" (the toggle is hidden). */
const noRepoImages = (): readonly string[] | undefined => undefined;

function ImageTabBody({ repoId }: { repoId: string }) {
  const kit = useMediaKit();
  const {
    MediaLayout,
    ExportToolbar,
    MediaProjectsAccordion,
    revealMedia,
    useMediaExport,
    useMediaFiles,
    useMediaMutations,
    useMediaProjects,
    clearMediaOpenRequest,
  } = kit;
  const openMediaPane = kit.useOpenMediaPane();
  const host = useImagesHost();
  const CreatePanel = host.CreatePanel ?? BasicCreatePanel;
  const useRepoImagePaths = host.useRepoImagePaths ?? noRepoImages;
  const [selection, setSelection] = useState<MediaSelection | null>(null);
  const [allInRepo, setAllInRepo] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [quality, setQuality] = useState(85);
  // Phase 112 Theme E — a reveal selects an image (or its project) the way an explorer click does.
  const openRequest = kit.useMediaOpenFor('image', repoId);
  useEffect(() => {
    if (!openRequest) return;
    setAllInRepo(false);
    setSelection({ project: openRequest.project, path: openRequest.path ?? null });
    clearMediaOpenRequest();
  }, [openRequest, clearMediaOpenRequest]);
  const prefs = useImagePrefs();
  const [form, dispatch] = useReducer(createPanelReducer, undefined, () =>
    initialCreateState(prefs.provider, prefs.model),
  );

  const projects = useMediaProjects(repoId, 'image');
  const activeProject = selection?.project ?? projects.data?.[0]?.name ?? null;
  const files = useMediaFiles(repoId, 'image', allInRepo ? null : activeProject);
  const repoImages = useRepoImagePaths(repoId, allInRepo);
  const providers = useImageProviders();
  const generation = useImageGeneration(repoId);
  const mutations = useMediaMutations(repoId, 'image');
  const exporter = useMediaExport();
  const dialogs = useFrameChrome().useDialogs();

  const images = useMemo<GalleryImage[]>(() => {
    if (allInRepo) {
      return (repoImages ?? []).map((path) => ({ key: `repo:${path}`, project: null, path, url: mstudioFileUrl('repo', repoId, path) }));
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
  }, [allInRepo, repoImages, files.data, activeProject, repoId]);

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
              <BrandSlider
                min={1}
                max={100}
                value={quality}
                onValueChange={setQuality}
                aria-label="Export quality"
                className="w-24"
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
            {host.useRepoImagePaths ? (
              <label className="flex h-8 shrink-0 items-center gap-2 border-t border-border px-2 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={allInRepo}
                  onChange={(event) => setAllInRepo(event.target.checked)}
                  className="accent-primary"
                />
                All images in repo
              </label>
            ) : null}
          </div>
        }
        content={
          images.length === 0 && pendingCount === 0 ? (
            <EmptyState
              icon={LuImage}
              title="No images yet"
              body="Describe what you want in the create panel and generate your first image."
              action={<EmptyStateButton icon={LuSparkles} filledIcon={PiSparkleFill} label="Generate image" onClick={() => openMediaPane('image', 'detail')} />}
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
