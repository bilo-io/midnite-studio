import { useEffect, useRef } from 'react';

import type { LibraryPlayerProps } from './host';

/**
 * The library's own player (Phase 113 Theme R): the platform's `<video>`/`<audio>` with native controls —
 * the same element Media ▸ Video plays iterations in — plus the two things a library needs and the
 * shared players do not have: start from where the user stopped, and report where they are.
 *
 * Playback is local only: `src` is `mstudio-file://library/…`, which main serves from the root through
 * its path jail. A format Chromium cannot decode does not play here; transcoding (slice R2) is for the
 * devices Share on your network streams to, through the user's own ffmpeg.
 */
export function LibraryPlayer({ item, src, resumeAt, autoPlay, onProgress }: LibraryPlayerProps) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const report = useRef(onProgress);
  report.current = onProgress;

  // The last position is saved when the item changes or the player goes away (a closed detail pane).
  useEffect(() => {
    const element = ref.current;
    return () => {
      if (element && element.currentTime > 0) {
        report.current(element.currentTime, element.duration || 0, 'paused');
      }
    };
  }, [src]);

  const common = {
    ref,
    src,
    controls: true,
    autoPlay: autoPlay ?? false,
    preload: 'metadata' as const,
    'aria-label': `Play ${item.title}`,
    onLoadedMetadata: () => {
      const element = ref.current;
      if (element && resumeAt > 0 && resumeAt < (element.duration || Infinity))
        element.currentTime = resumeAt;
    },
    onTimeUpdate: () => {
      const element = ref.current;
      if (element) report.current(element.currentTime, element.duration || 0, 'playing');
    },
    onPause: () => {
      const element = ref.current;
      if (element && !element.ended)
        report.current(element.currentTime, element.duration || 0, 'paused');
    },
    onEnded: () => {
      const element = ref.current;
      if (element)
        report.current(element.duration || element.currentTime, element.duration || 0, 'ended');
    },
  };

  if (item.kind === 'music') return <audio {...common} className="w-full" />;
  return <video {...common} className="max-h-[50vh] w-full rounded-md bg-black" />;
}
