import { Easing, Sequence, interpolate, useCurrentFrame } from "remotion";

import type { Theme } from "../../../../../shared/brand";
import { AppShot, type Approach } from "../AppShot";
import { BUILD } from "../beats";
import { ClaimSlide } from "../ClaimSlide";
import { MULTI_WINDOW, type Shot } from "../clips";
import { STAGE, WINDOW, WINDOW_LEFT } from "../layout";
import { themeAt } from "../wipes";

/**
 * Multi-window — the main window folds its panels away, and each one stands
 * beside it as a window of its own.
 *
 * The client's sixth round, in order: the main window alone; the loops panel
 * collapses on the right and the loops window appears to its right; the repos
 * panel on the left, and the repos window to its left; then the terminal along
 * the bottom, and the terminal window beneath. A small gap between each.
 *
 * ── Each window lands on a hit ──────────────────────────────────────────────
 *
 * The recording's fold finishes on the beat and the detached window arrives
 * on it (`BUILD.detach`, which says where the beats came from, and
 * `MULTI_WINDOW` in `clips.ts`, which times the take to them). So the viewer
 * sees the panel go just before the music hits, and the window it became
 * struck onto the stage with it — the same seven-frame `AppShot` reveal every
 * other card in the film uses, from the side the panel left by.
 *
 * ── The layout makes room, it does not rearrange ────────────────────────────
 *
 * Four states, one per step, and each is the previous one plus a window:
 *
 *   0  main alone — the tour window's width, 760 tall, centred.
 *   1  loops (411×840) at its right. The pair is re-centred, so main slides
 *      left at full size.
 *   2  repos at the left. Main shrinks to the width between the two panels,
 *      at its own aspect, and stands in the middle of their height.
 *   3  the terminal under main, at main's width. Main rises to the top of the
 *      column to make room for it.
 *
 * The main card is never re-laid-out, only transformed — a card resized box by
 * box re-fits its recording every frame, which reads as the picture swimming.
 * Everything is in the main card's own coordinates, whose origin is the
 * tour window's top-left (`WINDOW_LEFT`, and the caption's line above it).
 */

/** Between windows. v7 widened it from 16 — "a bit more breathing room". */
const GAP = 32;
/** The panel takes are 840×1718; at the column's height that is this wide. */
const SIDE = { width: Math.round((WINDOW.height * 840) / 1718), height: WINDOW.height } as const; // 411×840

/**
 * The main window's frame: the tour window's width, but less tall (v7), so
 * that once it has shrunk between the side windows the terminal under it gets
 * more of the column. The take is 1.6:1 and this is 1.83:1, so the cover fit
 * trims a little off its top and bottom — title bar and status line, not the
 * graph.
 */
const MAIN = { width: WINDOW.width, height: 760 } as const;

/** The group re-centred with the loops window on: main + gap + side. */
const PAIR_LEFT = (STAGE.width - (MAIN.width + GAP + SIDE.width)) / 2 - WINDOW_LEFT;
/** Both side windows at the pair's outer edges, main between them. */
const TRIO_LEFT = PAIR_LEFT + SIDE.width + GAP;
/* The pair's width, less the repos window and its gap — main shrinks into what the pair left. */
const TRIO_SCALE = (MAIN.width - SIDE.width - GAP) / MAIN.width; // 948 / 1391
const TRIO_MAIN = { width: MAIN.width * TRIO_SCALE, height: MAIN.height * TRIO_SCALE };

const TERMINAL = {
  left: TRIO_LEFT,
  top: TRIO_MAIN.height + GAP,
  width: TRIO_MAIN.width,
  height: WINDOW.height - TRIO_MAIN.height - GAP,
}; // 948×290

/** Main's top, centred in the column, before and after it shrinks. */
const Y_ALONE = (WINDOW.height - MAIN.height) / 2;
const Y_TRIO = (WINDOW.height - TRIO_MAIN.height) / 2;

/**
 * Frames the layout takes to make room, and how many of them come before the
 * beat. It has to *lead*: each detached window starts its reveal at 70% of its
 * size behind where main is standing, and if main only starts moving on the
 * beat the window is hidden for its first frames and seems to land late. So
 * main moves while the panel is still folding — which is when the app itself
 * is making the same room — and the space is open by the hit.
 */
const MAKE_ROOM = 9;
const LEAD = 4;

/** Shot frames, from this slide's cut, that each window lands on. */
const AT = {
  loops: BUILD.detach.loops - BUILD.items[0],
  repos: BUILD.detach.repos - BUILD.items[0],
  terminal: BUILD.detach.terminal - BUILD.items[0],
} as const;

export const MultiWindow: React.FC<{ text: string; from: Approach }> = ({ text, from }) => {
  const frame = useCurrentFrame();

  const step = (at: number) =>
    interpolate(frame, [at - LEAD, at - LEAD + MAKE_ROOM], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
  const one = step(AT.loops);
  const two = step(AT.repos);
  const three = step(AT.terminal);

  const x = interpolate(one, [0, 1], [0, PAIR_LEFT]) + two * (TRIO_LEFT - PAIR_LEFT);
  const scale = interpolate(two, [0, 1], [1, TRIO_SCALE]);
  /* Centred in the column until the terminal comes, then up to its top. */
  const y = Y_ALONE + two * (Y_TRIO - Y_ALONE) - three * Y_TRIO;
  const theme = themeAt(BUILD.items[0]);

  return (
    <ClaimSlide
      text={text}
      shot={MULTI_WINDOW.main}
      at={BUILD.items[0]}
      theme={theme}
      from={from}
      cardSize={MAIN}
      cardTransform={`translate(${x}px, ${y}px) scale(${scale})`}
      behind={
        <>
          <Detached
            shot={MULTI_WINDOW.loops}
            at={AT.loops}
            left={PAIR_LEFT + WINDOW.width + GAP}
            top={0}
            size={SIDE}
            from="left"
            theme={theme}
          />
          <Detached
            shot={MULTI_WINDOW.repos}
            at={AT.repos}
            left={PAIR_LEFT}
            top={0}
            size={SIDE}
            from="right"
            theme={theme}
          />
          <Detached
            shot={MULTI_WINDOW.terminal}
            at={AT.terminal}
            left={TERMINAL.left}
            top={TERMINAL.top}
            size={TERMINAL}
            from="top"
            theme={theme}
          />
        </>
      }
    />
  );
};

/**
 * One panel, as its own window, from the frame it lands. It arrives from the
 * side facing main — the side it left by — so it reads as coming *out of* the
 * main window rather than in from the edge of the stage.
 */
const Detached: React.FC<{
  shot: Shot;
  at: number;
  left: number;
  top: number;
  size: { width: number; height: number };
  from: Approach;
  theme: Theme;
}> = ({ shot, at, left, top, size, from, theme }) => (
  <Sequence from={at} layout="none">
    <div style={{ position: "absolute", left, top }}>
      <AppShot
        shot={shot}
        width={size.width}
        height={size.height}
        theme={theme}
        glow={0.22}
        radius={14}
        startsAt={BUILD.items[0] + at}
        from={from}
      />
    </div>
  </Sequence>
);
