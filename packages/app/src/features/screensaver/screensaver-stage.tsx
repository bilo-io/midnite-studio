import { useEffect, useState, type CSSProperties } from 'react';

import { Spinner } from '../../components/spinner';
import { useForgePulls, useRepos } from '../../services/queries';
import { useUiStore } from '../../store/ui-store';
import { agentCount } from '../agent/agent-count';
import { useTerminalStore } from '../terminal/terminal-store';
import { MODE_TINT, nextRandomIndex, WORD_SETS, type Mode } from './screensaver-words';

/**
 * The screensaver's centre column — spinner, typed word, subtitle, count pills
 * — and the workspace reading that drives it.
 *
 * Extracted from `screensaver.tsx` when the landing page gained a carousel
 * whose first slide *is* this stage. Two things made a copy the wrong answer:
 * the mode (`active` / `waiting` / `idle`) is derived from four live queries
 * and picks both the tint and the word list, and the typewriter's cadence is
 * a user setting. A second implementation would have been a second set of
 * both.
 *
 * The hook and the component are deliberately separate exports because the
 * landing page's carousel unmounts the slide it is not showing: the reading
 * has to live at the host, above the carousel, or every return to slide one
 * would re-subscribe four queries and flash empty counts on the way back.
 */

type Counts = { repos: number; agents: number; myPrs: number; teamPrs: number };

export type PillKey = keyof Counts;

const PILLS: Array<{ key: PillKey; label: string; hueVar: string; destination: string }> = [
  { key: 'repos', label: 'repos', hueVar: '217 91% 60%', destination: 'open the repositories panel' },
  { key: 'agents', label: 'agents', hueVar: '280 65% 60%', destination: 'reveal the terminal' },
  { key: 'myPrs', label: 'my PRs', hueVar: '142 71% 45%', destination: 'open Reviews' },
  { key: 'teamPrs', label: 'team PRs', hueVar: '38 92% 50%', destination: 'open Reviews' },
];

export type ScreensaverReading = { mode: Mode; counts: Counts };

/**
 * What the workspace currently looks like, as one mode and four counts.
 *
 * `active` outranks `waiting`: an agent that is mid-run is the more urgent
 * fact than a PR sitting in a queue, and the two are frequently both true.
 */
export function useScreensaverReading(): ScreensaverReading {
  const { data: openRepos } = useRepos();
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const { data: myPullsData } = useForgePulls(selectedRepoId, true, 50, 'open', 'mine');
  const { data: teamPullsData } = useForgePulls(selectedRepoId, true, 50, 'open', 'all');
  const agentsCount = useTerminalStore((s) => agentCount(s.sessions, s.states, s.liveAgentId));

  const myPrsCount = myPullsData?.pulls?.length ?? 0;
  const teamPrsCount = teamPullsData?.pulls?.length ?? 0;

  return {
    mode:
      agentsCount > 0 ? 'active' : myPrsCount > 0 || teamPrsCount > 0 ? 'waiting' : 'idle',
    counts: {
      repos: openRepos?.length ?? 0,
      agents: agentsCount,
      myPrs: myPrsCount,
      teamPrs: teamPrsCount,
    },
  };
}

const MODE_SUBTITLE: Record<Mode, string> = {
  active: 'Agents hard at work',
  waiting: 'PRs awaiting review and attention',
  idle: 'All caught up — workspace ready',
};

/**
 * One word at a time out of the mode's list, typed a character at a time and
 * then held for `cycleDurationS` before the next is picked at random.
 *
 * `paused` exists for the landing page, and holds the typing still for the
 * ~590ms a slide change takes: a word that types itself out *while* sliding
 * in reads as two animations arguing, where one that starts once the slide
 * has settled reads as the page greeting you. It is not an idle-cost
 * measure — the carousel unmounts the slides it is not showing, so there is
 * no background ticking to stop.
 */
function useTypedWord(mode: Mode, paused = false): string {
  const cycleDurationS = useUiStore((s) => s.cycleDurationS);
  const [index, setIndex] = useState(() =>
    Math.floor(Math.random() * WORD_SETS[mode].length),
  );
  const [typed, setTyped] = useState('');

  useEffect(() => {
    setIndex(Math.floor(Math.random() * WORD_SETS[mode].length));
  }, [mode]);

  const cycleMs = (cycleDurationS ?? 10) * 1000;

  useEffect(() => {
    if (paused) return;
    const set = WORD_SETS[mode];
    const word = set[index % set.length] ?? 'loading';
    let i = 0;
    let holdTimer: ReturnType<typeof setTimeout>;
    setTyped('');
    const typeTimer = setInterval(() => {
      i += 1;
      setTyped(word.slice(0, i));
      if (i >= word.length) {
        clearInterval(typeTimer);
        holdTimer = setTimeout(() => setIndex((n) => nextRandomIndex(set.length, n)), cycleMs);
      }
    }, 65);
    return () => {
      clearInterval(typeTimer);
      clearTimeout(holdTimer);
    };
  }, [index, mode, cycleMs, paused]);

  return typed;
}

export function ScreensaverStage({
  mode,
  counts,
  paused = false,
  onPillClick,
}: ScreensaverReading & {
  paused?: boolean;
  /** Phase 46 Theme C. Both call sites pass one; optional only so a future
   * read-only host isn't forced to invent a no-op. */
  onPillClick?: (key: PillKey) => void;
}) {
  const typed = useTypedWord(mode, paused);
  const tint = { '--sv-tint': MODE_TINT[mode] } as CSSProperties;

  return (
    <>
      <div className="mb-10" style={tint}>
        <Spinner mode={mode} />
      </div>

      <h1
        className="screensaver-title flex items-baseline pb-3 text-4xl font-semibold leading-[1.15] tracking-tight sm:text-6xl"
        style={tint}
      >
        {typed}
        <span
          aria-hidden
          className="ml-0.5 inline-block w-[0.06em] self-stretch bg-foreground text-transparent animate-[blink_1s_step-end_infinite]"
        >
          |
        </span>
      </h1>

      <p className="mt-2 text-sm text-muted-foreground">{MODE_SUBTITLE[mode]}</p>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-2.5">
        {PILLS.map(({ key, label, hueVar, destination }, i) => {
          const n = counts[key];
          const hue = `hsl(${hueVar})`;
          return (
            <button
              key={key}
              type="button"
              onClick={(e) => {
                // Must not be swallowed by LockScreen's root dismiss/unlock
                // handler — the same reason widgets stop propagation, just for
                // the opposite outcome: this click does something specific
                // instead of nothing at all.
                e.stopPropagation();
                onPillClick?.(key);
              }}
              aria-label={`${n} ${label} — ${destination}`}
              className="relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-border/60 bg-card/60 px-3.5 py-1.5 text-xs font-medium text-foreground/80 backdrop-blur transition-colors hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                aria-hidden
                className="pill-shimmer pointer-events-none absolute inset-0"
                style={
                  {
                    background: `linear-gradient(100deg, transparent 38%, ${hue} 50%, transparent 62%)`,
                    '--pill-i': i,
                  } as CSSProperties
                }
              />
              <span
                aria-hidden
                className="relative h-2 w-2 rounded-full"
                style={{ background: hue, boxShadow: `0 0 8px ${hue}` }}
              />
              <span aria-hidden className="relative tabular-nums text-foreground">{n}</span>
              <span aria-hidden className="relative">{label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
