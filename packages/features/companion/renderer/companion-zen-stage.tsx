import { ringGeometry } from '@midnite/studio-frame';
import type { CompanionState, CompanionTurn, MetricId } from '@midnite/studio-shared';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LuMinimize2 } from 'react-icons/lu';

import { IconButton } from './ext-ui';
import { useMetricsStore } from '@midnite/studio-frame';
import { useCompanionStore } from './companion-store';
import { useUiStore } from './ext';
import { METRIC_LABELS, metricColor } from '@midnite/studio-frame';
import { useMetricsStream } from '@midnite/studio-frame';
import { LockScreenFintechWidget, LockScreenSysmonWidget } from './ext-ui';
import { applyPillDestination } from './ext-ui';
import { useScreensaverReading, type PillKey } from './ext-ui';
import { CompanionInputBar } from './companion-input-bar';
import { CompanionOrb } from './companion-orb';
import { companionPorts } from './companion-ports';

/**
 * Companion Zen mode — the full-stage view.
 *
 * Portalled to `document.body` so it escapes the docked column's
 * `overflow-hidden` tween frame; React context still flows through a portal,
 * so the dialog/toast/query providers the input bar needs are all present.
 *
 * Layout: a giant orb centre stage, the last companion/agent turn on its left
 * (grows out of the core while it types), the last user turn on its right
 * (rises from the composer), the composer floating bottom-centre, and four HUD
 * clusters — perf charts top-centre, activity pills top-left, dial gauges
 * top-right, market bottom-left — each semitransparent and scaled down until
 * hovered.
 *
 * All motion is CSS transitions (one-shot, triggered by an `entered` flag set
 * a frame after mount) under `motion-safe:`, so reduced motion lands every
 * element at its resting place with no new keyframes to guard.
 */
export function CompanionZenStage({ state }: { state: CompanionState }) {
  const transcript = useCompanionStore((s) => s.transcript);
  const setZenMode = useCompanionStore((s) => s.setZenMode);
  const lastAgent = lastTurn(transcript, (t) => t.role !== 'user');
  const lastUser = lastTurn(transcript, (t) => t.role === 'user');

  useMetricsStream({ detailed: true });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !(event.target instanceof HTMLTextAreaElement)) setZenMode(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setZenMode]);

  return createPortal(
    <div
      data-testid="companion-zen-stage"
      data-companion-state={state}
      className="fixed inset-0 z-[90] overflow-hidden bg-background/95 backdrop-blur-xl"
    >
      {/* Ambient radial glow behind the orb. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 motion-safe:animate-pulse"
        style={{
          background:
            'radial-gradient(circle, hsl(var(--primary) / 0.22) 0%, hsl(var(--primary) / 0.06) 40%, transparent 70%)',
        }}
      />

      <HudCorner testId="companion-zen-top-left" className="left-5 top-5 origin-top-left">
        <ZenActivityPills />
      </HudCorner>

      <HudCorner
        testId="companion-zen-top-center"
        className="left-1/2 top-4 origin-top -translate-x-1/2"
      >
        <LockScreenSysmonWidget />
      </HudCorner>

      <div className="absolute right-5 top-5 z-10 flex items-start gap-3">
        <HudCorner testId="companion-zen-top-right" className="relative origin-top-right">
          <ZenDialCharts />
        </HudCorner>
        <IconButton
          icon={LuMinimize2}
          label="Exit Zen mode"
          onClick={() => setZenMode(false)}
          data-testid="companion-zen-exit"
        />
      </div>

      <HudCorner testId="companion-zen-bottom-left" className="bottom-5 left-5 origin-bottom-left">
        <LockScreenFintechWidget />
      </HudCorner>

      {/* Centre stage: agent · orb · user. */}
      <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-center gap-6 px-8">
        {/* z-10: the orb's canvas bleeds under both bubbles, which must stay on top of it. */}
        <div className="relative z-10 flex min-w-0 flex-1 justify-end">
          {lastAgent ? <ZenAgentBubble key={lastAgent.id} turn={lastAgent} state={state} /> : null}
        </div>
        <div data-testid="companion-zen-orb" className="relative shrink-0">
          {/*
            No halo element here: the orb's canvas bleeds past this box and draws its
            own breathing corona. The box-shadow halo that used to sit here was never
            painted inside its own box, leaving a dark disc with a hard edge.
          */}
          <CompanionOrb state={state} zen />
        </div>
        <div className="relative z-10 flex min-w-0 flex-1 justify-start">
          {lastUser ? <ZenUserBubble key={lastUser.id} turn={lastUser} /> : null}
        </div>
      </div>

      <div
        data-testid="companion-zen-composer"
        className="absolute bottom-6 left-1/2 w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-primary/30 bg-card/60 shadow-[0_0_40px_hsl(var(--primary)/0.25)] backdrop-blur-md transition-shadow duration-500 focus-within:shadow-[0_0_60px_hsl(var(--primary)/0.45)]"
      >
        <CompanionInputBar
          disabled={state === 'thinking'}
          onInterrupt={() => companionPorts().interrupt()}
        />
      </div>
    </div>,
    document.body,
  );
}

function lastTurn(
  turns: readonly CompanionTurn[],
  match: (turn: CompanionTurn) => boolean,
): CompanionTurn | null {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    if (turn && match(turn)) return turn;
  }
  return null;
}

/** Flips to `true` a frame after mount — the trigger for every one-shot entrance transition. */
function useEntered(): boolean {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return entered;
}

/** Reveals `text` a few characters per tick; reduced motion shows it whole. */
export function useTypewriter(text: string, charsPerTick = 2, tickMs = 18): string {
  const reduced =
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-motion') === 'reduced';
  const [shown, setShown] = useState(reduced ? text.length : 0);
  useEffect(() => {
    if (reduced) {
      setShown(text.length);
      return;
    }
    setShown(0);
    const timer = setInterval(() => {
      setShown((n) => {
        const next = Math.min(text.length, n + charsPerTick);
        if (next >= text.length) clearInterval(timer);
        return next;
      });
    }, tickMs);
    return () => clearInterval(timer);
  }, [text, reduced, charsPerTick, tickMs]);
  return text.slice(0, shown);
}

const EASE: CSSProperties = { transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' };

function ZenAgentBubble({ turn, state }: { turn: CompanionTurn; state: CompanionState }) {
  const entered = useEntered();
  const typed = useTypewriter(turn.text);
  const typing = typed.length < turn.text.length;
  return (
    <div
      data-testid="companion-zen-agent-turn"
      data-typing={typing ? 'true' : undefined}
      style={EASE}
      className={`relative max-w-md rounded-2xl rounded-br-sm border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-relaxed text-foreground/70 shadow-[0_0_30px_hsl(var(--primary)/0.18)] backdrop-blur-sm motion-safe:transition-all motion-safe:duration-700 ${
        entered ? 'translate-x-0 scale-100 opacity-100' : 'translate-x-[45%] scale-50 opacity-0'
      }`}
    >
      <span className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-primary/60">
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))] ${
            typing || state === 'speaking' ? 'motion-safe:animate-pulse' : ''
          }`}
        />
        {turn.role === 'agent' ? 'Agent' : 'Companion'}
      </span>
      <span className="whitespace-pre-wrap">{typed}</span>
      {typing ? <span aria-hidden className="ml-0.5 inline-block h-3.5 w-px bg-primary/70 align-middle motion-safe:animate-pulse" /> : null}
    </div>
  );
}

function ZenUserBubble({ turn }: { turn: CompanionTurn }) {
  const entered = useEntered();
  return (
    <div
      data-testid="companion-zen-user-turn"
      style={EASE}
      className={`max-w-sm rounded-2xl rounded-bl-sm border border-border/50 bg-card/40 px-4 py-3 text-sm leading-relaxed text-foreground/60 shadow-[0_0_24px_hsl(var(--foreground)/0.06)] backdrop-blur-sm motion-safe:transition-all motion-safe:duration-700 ${
        entered
          ? 'translate-x-0 translate-y-0 scale-100 opacity-100'
          : '-translate-x-[40%] translate-y-[35vh] scale-75 opacity-0'
      }`}
    >
      <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground/60">You</span>
      <span className="whitespace-pre-wrap">{turn.text}</span>
    </div>
  );
}

/** A HUD cluster: faint and compact at rest, full size and glowing on hover or focus. */
function HudCorner({
  testId,
  className,
  children,
}: {
  testId: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      data-zen-hud
      className={`absolute z-10 scale-90 rounded-2xl opacity-35 transition-all duration-300 ease-out hover:scale-100 hover:bg-card/40 hover:opacity-100 hover:shadow-[0_0_32px_hsl(var(--primary)/0.25)] focus-within:scale-100 focus-within:opacity-100 ${className}`}
    >
      {children}
    </div>
  );
}

const PILLS: Array<{ key: PillKey; label: string; hue: string }> = [
  { key: 'repos', label: 'repos', hue: 'hsl(217 91% 60%)' },
  { key: 'agents', label: 'agents', hue: 'hsl(280 65% 60%)' },
  { key: 'myPrs', label: 'my PRs', hue: 'hsl(142 71% 45%)' },
  { key: 'teamPrs', label: 'team PRs', hue: 'hsl(38 92% 50%)' },
];

function ZenActivityPills() {
  const { counts } = useScreensaverReading();
  const setZenMode = useCompanionStore((s) => s.setZenMode);
  return (
    <div className="flex flex-col gap-2 p-3">
      {PILLS.map(({ key, label, hue }) => (
        <button
          key={key}
          type="button"
          data-testid={`companion-zen-pill-${key}`}
          onClick={() => {
            const ui = useUiStore.getState();
            setZenMode(false);
            applyPillDestination(key, {
              setActiveView: ui.setActiveView,
              setReposOpen: ui.setReposOpen,
              setTerminalOpen: ui.setTerminalOpen,
            });
          }}
          className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3.5 py-1.5 text-xs font-medium text-foreground/80 backdrop-blur hover:bg-card/80"
        >
          <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: hue, boxShadow: `0 0 8px ${hue}` }} />
          <span className="tabular-nums text-foreground">{counts[key]}</span>
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

const DIAL_GEOMETRY = { size: 64, thickness: 0.16 };
const DIAL_METRICS: MetricId[] = ['cpu', 'memory', 'gpu', 'disk'];

function ZenDialCharts() {
  const latest = useMetricsStore((s) => s.latest);
  const battery = latest?.battery?.percent;
  const dials: Array<{ id: string; label: string; value: number | null; color: string }> = [
    ...DIAL_METRICS.map((id) => ({
      id,
      label: METRIC_LABELS[id],
      value: (latest?.[id] as number | undefined) ?? null,
      color: metricColor(id),
    })),
    ...(battery != null
      ? [{ id: 'battery', label: 'Battery', value: battery, color: 'hsl(142 71% 45%)' }]
      : []),
  ];
  return (
    <div className="flex gap-3 p-3">
      {dials.map((dial) => {
        const g = ringGeometry(dial.value ?? 0, DIAL_GEOMETRY);
        return (
          <div key={dial.id} data-testid={`companion-zen-dial-${dial.id}`} className="flex flex-col items-center gap-1">
            <svg
              width={DIAL_GEOMETRY.size}
              height={DIAL_GEOMETRY.size}
              viewBox={`0 0 ${DIAL_GEOMETRY.size} ${DIAL_GEOMETRY.size}`}
              role="img"
              aria-label={`${dial.label} ${dial.value == null ? 'unknown' : `${Math.round(dial.value)}%`}`}
              style={{ filter: `drop-shadow(0 0 6px ${dial.color})` }}
            >
              <circle cx={g.centre} cy={g.centre} r={g.radius} fill="none" stroke="hsl(var(--muted-foreground) / 0.2)" strokeWidth={g.stroke} />
              <circle
                cx={g.centre}
                cy={g.centre}
                r={g.radius}
                fill="none"
                stroke={dial.color}
                strokeWidth={g.stroke}
                strokeLinecap="round"
                strokeDasharray={`${g.dash} ${g.circumference}`}
                transform={`rotate(-90 ${g.centre} ${g.centre})`}
                className="transition-[stroke-dasharray] duration-700"
              />
              <text x="50%" y="54%" textAnchor="middle" className="fill-foreground font-mono text-[13px] font-semibold">
                {dial.value == null ? '—' : Math.round(dial.value)}
              </text>
            </svg>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{dial.label}</span>
          </div>
        );
      })}
    </div>
  );
}
