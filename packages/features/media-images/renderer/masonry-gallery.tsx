import { LuPlus } from 'react-icons/lu';

/** One image the gallery can show; `project` is null for an "All images in repo" file. */
export type GalleryImage = {
  key: string;
  project: string | null;
  path: string;
  url: string;
};

/**
 * Past this many tiles, off-screen ones skip layout and paint
 * (`content-visibility: auto`) — Chromium's own virtualisation, which keeps
 * CSS columns' natural masonry flow intact where a windowed list would not.
 */
export const GALLERY_VIRTUALISE_AT = 200;

/**
 * The Images centre pane (Phase 99 Theme C): a CSS-columns masonry, led by a
 * large dashed "+" tile that glows on hover and opens the create panel.
 * Generations still running show as shimmer placeholders until their files
 * land.
 */
export function MasonryGallery({
  images,
  pendingCount,
  selectedKey,
  onCreate,
  onOpen,
}: {
  images: readonly GalleryImage[];
  pendingCount: number;
  selectedKey: string | null;
  onCreate: () => void;
  onOpen: (index: number) => void;
}) {
  const virtualise = images.length > GALLERY_VIRTUALISE_AT;
  return (
    <div className="hide-scrollbar h-full overflow-auto p-3">
      <ul aria-label="Images" className="columns-[200px] gap-3" data-testid="media-masonry">
        <li className="mb-3 break-inside-avoid">
          <button
            type="button"
            onClick={onCreate}
            className="media-plus-tile flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-lg"
          >
            <LuPlus aria-hidden className="media-plus-tile__icon h-10 w-10" />
            <span className="media-plus-tile__label text-sm font-semibold">Generate image</span>
          </button>
        </li>
        {Array.from({ length: pendingCount }, (_, i) => (
          <li key={`pending-${i}`} className="mb-3 break-inside-avoid" aria-label="Generating image">
            <div className="media-shimmer aspect-square w-full rounded-lg" />
          </li>
        ))}
        {images.map((image, index) => (
          <li
            key={image.key}
            className="mb-3 break-inside-avoid"
            style={virtualise ? { contentVisibility: 'auto', containIntrinsicSize: 'auto 220px' } : undefined}
          >
            <button
              type="button"
              aria-label={`Open ${image.path}`}
              aria-current={selectedKey === image.key || undefined}
              onClick={() => onOpen(index)}
              className={`block w-full overflow-hidden rounded-lg border bg-muted/40 ${
                selectedKey === image.key ? 'border-ring ring-1 ring-ring' : 'border-border hover:border-foreground/30'
              }`}
            >
              <img
                src={image.url}
                alt={image.path}
                loading="lazy"
                decoding="async"
                draggable={false}
                className="block min-h-16 w-full object-cover"
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
