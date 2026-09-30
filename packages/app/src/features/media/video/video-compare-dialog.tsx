import { videoFileUrl } from '@midnite/studio-shared';
import { useRef } from 'react';
import { LuPause, LuPlay } from 'react-icons/lu';

import { Modal } from '../../../components/modal';

/**
 * Compare with… (Phase 99 Theme D) — two iterations side by side, with one
 * control that plays, pauses and rewinds both together.
 */
export function VideoCompareDialog({
  projectId,
  left,
  right,
  onClose,
}: {
  projectId: string;
  left: string;
  right: string | null;
  onClose: () => void;
}) {
  const a = useRef<HTMLVideoElement>(null);
  const b = useRef<HTMLVideoElement>(null);
  const both = (fn: (video: HTMLVideoElement) => void) => {
    for (const ref of [a, b]) if (ref.current) fn(ref.current);
  };

  return (
    <Modal open={right !== null} onClose={onClose} title="Compare iterations" size="full" testId="video-compare-dialog">
      <div className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Compare iterations</h2>
          <button
            type="button"
            onClick={() => both((v) => void v.play())}
            className="ml-auto flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
          >
            <LuPlay aria-hidden className="h-3 w-3" /> Play both
          </button>
          <button
            type="button"
            onClick={() => both((v) => v.pause())}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
          >
            <LuPause aria-hidden className="h-3 w-3" /> Pause
          </button>
          <button
            type="button"
            onClick={() =>
              both((v) => {
                v.currentTime = 0;
              })
            }
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
          >
            Restart
          </button>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent">
            Close
          </button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
          {[
            { ref: a, name: left },
            { ref: b, name: right },
          ].map(({ ref, name }) =>
            name ? (
              <figure key={name} className="flex min-h-0 flex-col gap-1">
                <video
                  ref={ref}
                  aria-label={name}
                  src={videoFileUrl(`projects/${projectId}/output/${name}`)}
                  controls
                  className="min-h-0 w-full flex-1 rounded-md bg-black object-contain"
                />
                <figcaption className="text-center text-xs text-muted-foreground">{name}</figcaption>
              </figure>
            ) : null,
          )}
        </div>
      </div>
    </Modal>
  );
}
