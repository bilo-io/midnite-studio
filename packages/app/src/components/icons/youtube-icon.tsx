import type { CSSProperties } from 'react';

/**
 * YouTube's mark, as a local SVG.
 *
 * **Provenance.** Downloaded from
 * [vectorlogo.zone](https://www.vectorlogo.zone/logos/youtube/), a repository
 * of brand marks rather than an original work — the page itself states no
 * open licence and links onward to YouTube's own brand guidelines, so this is
 * a trademark asset rather than a CC0/MIT one like `codex-icon.tsx`'s or
 * `kilo-icon.tsx`'s. Reproduced here nominatively, to name the app this app
 * rail icon launches, the same basis the rest of `icons/` uses for logos it
 * doesn't own. This replaces `react-icons/si`'s monochrome `SiYoutube` — the
 * Phase 83 app rail's original placeholder — with the real red-and-white
 * play-button mark.
 *
 * Carries its own colours rather than `currentColor`, so `style` has no
 * visible effect on the fills — see `antigravity-icon.tsx`'s note on the same
 * tradeoff. Still accepted, so the component stays interchangeable with the
 * tintable marks; `strokeWidth` is accepted and ignored, as in every other
 * mark here.
 */
export function YoutubeIcon({
  className,
  style,
}: {
  className?: string;
  strokeWidth?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="red"
        d="M62.603 16.596a8.06 8.06 0 0 0-5.669-5.669C51.964 9.57 31.96 9.57 31.96 9.57s-20.005.04-24.976 1.397a8.06 8.06 0 0 0-5.669 5.669C0 21.607 0 32 0 32s0 10.393 1.356 15.404a8.06 8.06 0 0 0 5.669 5.669C11.995 54.43 32 54.43 32 54.43s20.005 0 24.976-1.356a8.06 8.06 0 0 0 5.669-5.669C64 42.434 64 32 64 32s-.04-10.393-1.397-15.404z"
      />
      <path fill="#fff" d="M25.592 41.612L42.187 32l-16.596-9.612z" />
    </svg>
  );
}
