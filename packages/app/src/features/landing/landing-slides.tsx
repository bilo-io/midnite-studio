import { DEFAULT_LOOPS } from '@midnite/studio-shared';
import type { CSSProperties } from 'react';

import { loopGlowColor } from '../loops/loop-glow';
import { loopIcon } from '../loops/loop-icons';
import { commandChord, type ShortcutBatch } from './landing-shortcuts';

/**
 * The carousel's teaching slides — two batches of shortcuts and the FAB
 * panel.
 *
 * Every glyph, colour, label and chord on these slides is read from the place
 * that already owns it (`COMMANDS`, `COMMAND_ICONS`, `DEFAULT_LOOPS`,
 * `loopIcon`, `loopGlowColor`) rather than restated. A cheat sheet that can
 * disagree with the app is worse than no cheat sheet.
 */

/** A keycap, set the way the status bar and the palette already set chords. */
function Keycap({ chord }: { chord: string }) {
  return (
    <kbd className="shrink-0 rounded-md border border-border/70 bg-card/70 px-2 py-1 font-mono text-[11px] font-semibold tabular-nums text-foreground shadow-sm backdrop-blur">
      {chord}
    </kbd>
  );
}

export function ShortcutSlide({ batch }: { batch: ShortcutBatch }) {
  return (
    <div className="flex max-w-3xl flex-col items-center">
      <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {batch.title}
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{batch.blurb}</p>

      <div className="mt-8 grid w-full grid-cols-1 gap-2 text-left sm:grid-cols-2">
        {batch.cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              data-testid={`landing-shortcut-${card.id}`}
              className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 px-3 py-2 backdrop-blur"
            >
              <Icon aria-hidden className="h-4 w-4 shrink-0 text-primary" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-xs font-medium text-foreground">{card.label}</span>
                {card.hint ? (
                  <span className="truncate text-[11px] text-muted-foreground">{card.hint}</span>
                ) : null}
              </span>
              <span className="ml-auto">
                <Keycap chord={card.chord} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The last slide: what the FAB panel is, its chord, and its six tabs in
 * their own colours.
 *
 * The tabs are `DEFAULT_LOOPS` itself — the same array the panel's own tab bar
 * maps over — so a seventh loop appears here the day it is added, wearing the
 * glyph and the `text-*` class it wears there. Its *tile* would be untinted
 * until someone gives it a row in `loop-glow.ts` and a line in `LOOP_BLURBS`
 * below, which is the same cost every other consumer of those two maps pays.
 */
export function FabSlide() {
  // From `COMMANDS`, with no literal chord written here — the same route the
  // shortcut cards take, so slide 2's `fab.toggle` row and this keycap cannot
  // disagree after a rebinding.
  const chord = commandChord('fab.toggle');

  return (
    <div className="flex max-w-2xl flex-col items-center">
      <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        The loop console
      </h2>
      <p className="mt-1.5 max-w-lg text-sm text-muted-foreground">
        A side panel of long-running agents. Each tab starts a{' '}
        <code className="rounded bg-muted px-1 py-0.5 text-[11px]">/loop</code> from your own
        settings and keeps its transcript, so a run survives a reload, a closed window and a
        relaunch.
      </p>

      <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
        {chord ? (
          <>
            <span>Open it with</span>
            <Keycap chord={chord} />
            <span>— or the mark in the bottom-right corner.</span>
          </>
        ) : (
          <span>Open it with the mark in the bottom-right corner.</span>
        )}
      </div>

      <div className="mt-8 grid w-full grid-cols-2 gap-2 text-left sm:grid-cols-4">
        {DEFAULT_LOOPS.map((loop) => {
          const Icon = loopIcon(loop.icon);
          const hue = loopGlowColor(loop.id);
          return (
            <div
              key={loop.id}
              data-testid={`landing-loop-${loop.id}`}
              className="flex flex-col items-center gap-2 rounded-xl border px-3 py-3 backdrop-blur"
              /*
                `color-mix`, not a `${hue}66` alpha suffix. `loopGlowColor`
                answers `currentColor` for an id it does not know (its
                documented neutral fallback), and `currentColor66` is not a
                colour — the browser drops the declaration and the tile loses
                its border and its wash together. `color-mix` takes any
                colour value, keyword fallback included.
              */
              style={
                {
                  borderColor: `color-mix(in srgb, ${hue} 40%, transparent)`,
                  background: `color-mix(in srgb, ${hue} 8%, transparent)`,
                } as CSSProperties
              }
            >
              <Icon aria-hidden className={`h-5 w-5 ${loop.color}`} />
              <span className={`text-xs font-semibold ${loop.color}`}>{loop.label}</span>
              <span className="text-center text-[11px] leading-snug text-muted-foreground">
                {LOOP_BLURBS[loop.id] ?? ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One line per tab, saying what its loop is *for*.
 *
 * `LoopDefinition` carries a label, a glyph and a prompt, and deliberately no
 * description — it is the wire contract, and prose belongs on this side of
 * the boundary (the same split `loop-icons.ts` and `loop-glow.ts` already
 * make for the glyph and the colour). An unknown id renders no line rather
 * than throwing, exactly as those two do.
 */
const LOOP_BLURBS: Record<string, string> = {
  guard: 'Sweeps for secrets, dependency and security risk',
  innovate: 'Proposes and refines the next phase',
  automate: 'Builds a phase and opens the PR',
  watchdog: 'Reviews PRs and answers feedback',
  medic: 'Chases failing checks until green',
  overhaul: 'Profiles startup, bundle size and renders',
};
