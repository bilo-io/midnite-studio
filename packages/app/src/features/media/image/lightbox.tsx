import { imageSidecarPath, parseImageSidecar, type ImageSidecar } from '@midnite/studio-shared';
import { useEffect, useRef } from 'react';
import { LuChevronLeft, LuChevronRight, LuFolderOpen, LuRefreshCw, LuTrash2, LuX } from 'react-icons/lu';

import { IconButton } from '../../../components/icon-button';
import { useDismiss } from '../../../components/use-dismiss';
import { useFocusTrap } from '../../../components/use-focus-trap';
import { useMediaFileText } from '../use-media';
import { positionLabel, stepIndex } from './lightbox-nav';
import type { GalleryImage } from './masonry-gallery';

/**
 * Full-window image viewer (Phase 99 Theme C). Escape closes it (through the
 * shared dismiss stack, which also counts it as an occluder so a browser
 * pane underneath hides), ←/→ step with wrap-around, and focus is trapped
 * inside. The side strip shows the sidecar a generation wrote, when there is
 * one.
 */
export function Lightbox({
  images,
  index,
  repoId,
  onIndex,
  onClose,
  onRerun,
  onReveal,
  onDelete,
}: {
  images: readonly GalleryImage[];
  index: number;
  repoId: string;
  onIndex: (index: number) => void;
  onClose: () => void;
  onRerun: (sidecar: ImageSidecar) => void;
  onReveal: (image: GalleryImage) => void;
  onDelete: (image: GalleryImage) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(true, onClose, { layer: 'dialog' });
  useFocusTrap(ref, true);

  const image = images[index];
  const step = (delta: number) => {
    const next = stepIndex(index, delta, images.length);
    if (next !== null) onIndex(next);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        step(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        step(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const sidecarText = useMediaFileText(
    repoId,
    'image',
    image?.project ?? null,
    image?.project ? imageSidecarPath(image.path) : null,
  );
  const sidecar = sidecarText.data ? parseImageSidecar(sidecarText.data) : null;

  if (!image) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={`Image ${positionLabel(index, images.length)}`}
      tabIndex={-1}
      className="fixed inset-0 z-dialog flex bg-background/95 outline-none"
    >
      <div className="relative flex min-w-0 flex-1 items-center justify-center p-10">
        <img src={image.url} alt={image.path} className="max-h-full max-w-full object-contain" />
        <IconButton
          icon={LuChevronLeft}
          label="Previous image"
          className="absolute left-3 top-1/2 -translate-y-1/2"
          onClick={() => step(-1)}
        />
        <IconButton
          icon={LuChevronRight}
          label="Next image"
          className="absolute right-3 top-1/2 -translate-y-1/2"
          onClick={() => step(1)}
        />
        <span
          data-testid="lightbox-position"
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-card/80 px-2 py-0.5 text-xs tabular-nums text-muted-foreground"
        >
          {positionLabel(index, images.length)}
        </span>
      </div>
      <aside aria-label="Image details" className="flex w-72 shrink-0 flex-col gap-3 border-l border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-xs font-semibold" title={image.path}>
            {image.path}
          </h2>
          <IconButton icon={LuX} label="Close" size="sm" onClick={onClose} />
        </div>
        {sidecar ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[11px]">
            <dt className="text-muted-foreground">Prompt</dt>
            <dd className="whitespace-pre-wrap text-foreground" data-selectable>
              {sidecar.prompt}
            </dd>
            <dt className="text-muted-foreground">Provider</dt>
            <dd>{sidecar.provider}</dd>
            <dt className="text-muted-foreground">Model</dt>
            <dd className="truncate">{sidecar.model}</dd>
            <dt className="text-muted-foreground">Aspect</dt>
            <dd>{sidecar.aspect}</dd>
            {sidecar.seed !== undefined ? (
              <>
                <dt className="text-muted-foreground">Seed</dt>
                <dd className="tabular-nums">{sidecar.seed}</dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">Created</dt>
            <dd>{new Date(sidecar.createdAt).toLocaleString()}</dd>
          </dl>
        ) : (
          <p className="text-[11px] text-muted-foreground">No generation metadata for this image.</p>
        )}
        <div className="mt-auto flex flex-col gap-1.5">
          <LightboxAction icon={LuRefreshCw} label="Re-run prompt" disabled={!sidecar} onClick={() => sidecar && onRerun(sidecar)} />
          <LightboxAction icon={LuFolderOpen} label="Reveal in Finder" disabled={!image.project} onClick={() => onReveal(image)} />
          <LightboxAction icon={LuTrash2} label="Delete" danger disabled={!image.project} onClick={() => onDelete(image)} />
        </div>
      </aside>
    </div>
  );
}

function LightboxAction({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  danger = false,
}: {
  icon: typeof LuX;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 ${
        danger ? 'text-destructive' : 'text-foreground'
      }`}
    >
      <Icon aria-hidden className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
