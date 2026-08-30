import { useEffect, useState, type CSSProperties } from 'react';

import { Spinner } from '../../components/spinner';
import { useForgePulls, useRepos } from '../../services/queries';
import { useAppearanceStore } from '../../store/appearance-store';
import { useUiStore } from '../../store/ui-store';
import { LockScreen } from './lock-screen';

const ACTIVE_WORDS = [
  'loading',
  'combobulating',
  'midnighting',
  'clauding',
  'vibing',
  'crushing it',
  'orchestrating',
  'klapping',
  'thinking',
  'reticulating',
  'computing',
  'conjuring',
  'brewing',
  'percolating',
  'assembling',
  'hydrating',
  'fidgeting',
  'tinkering',
  'wrangling',
  'noodling',
  'cooking',
  'simmering',
  'marinating',
  'hustling',
  'grinding',
  'flowing',
  'syncing',
  'aligning',
  'calibrating',
  'optimising',
  'refactoring',
  'untangling',
  'debugging',
  'parsing',
  'tokenizing',
  'developrogramming',
  'inferring',
  'reasoning',
  'pondering',
  'cogitating',
  'ruminating',
  'scheming',
  'plotting',
  'sketching',
  'drafting',
  'prototyping',
  'iterating',
  'polishing',
  'buffing',
  'tidying',
  'gardening',
  'pruning',
  'harvesting',
  'gathering',
  'mining',
  'navigating',
  'gliding',
  'soaring',
  'rocketing',
  'warping',
  'summoning',
  'kindling',
  'rolling',
  'sparkling',
  'dazzling',
  'flexing',
  'leveling up',
  'powering up',
  'charging up',
  'gearing up',
  'locking in',
  'dialing in',
  'in the zone, don’t look',
  'shipping it, ma bru',
  'making it happen',
  'heads down, hands moving',
  'this is the good part',
  'watch me work',
  'no notes, just vibes',
  'building the dream',
  'deep in the sauce',
  'chasing green checkmarks',
  'one commit at a time',
  'trust the process',
  'locked in, don’t @ me',
  'moving with purpose',
  'sharp sharp, on it',
  'lekker, this is flowing',
  'in my flow state',
  'busy being brilliant',
  'stacking small wins',
  'green lights all the way',
  'zero to merged',
  'compiling greatness',
];

const WAITING_WORDS = [
  'twiddling thumbs',
  'tumbleweeding',
  'watching ice melt',
  'watching grass grow',
  'watching paint dry',
  'counting ceiling tiles',
  'counting sheep',
  'humming elevator music',
  'staring into space',
  'cooling heels',
  'pacing the floor',
  'checking the clock',
  'killing time',
  'biding time',
  'loitering',
  'holding the line',
  'standing by',
  'awaiting orders',
  'awaiting your word',
  'spinning idle',
  'waiting on you, no rush',
  'ready when you say go',
  'need a yes or a no',
  'just say the word',
  'holding, but patiently',
  'paused, not stopped',
  'stuck at the crossroads',
  'give me the green light',
  'awaiting your blessing',
  'is this thing on?',
  'hello? still here...',
  'parked, engine running',
  'waiting for the go-ahead',
  'your call, boss',
  'sharp, just confirm and I go',
  'blocked on a human, classic',
  'staring at the prompt',
  'the suspense is killing me',
  'a decision awaits',
  'so close, just need a yes',
];

const IDLE_WORDS = [
  'anticipating',
  'keen to roll',
  'wanna vibe?',
  'what\'s up?',
  'ready when you are',
  'itching to go',
  'raring to go',
  'champing at the bit',
  'all charged up',
  'fired up',
  'locked and loaded',
  'queue me up',
  'feed me work',
  'point me at it',
  'give me something',
  'what’s next?',
  'tasks please',
  'let’s build',
  'let’s gooo',
  'let’s vibe',
  'ready to rumble',
  'bored already',
  'idle hands',
  'watching the cursor blink',
  'refreshing an empty board',
  'drop a task, any task',
  'I promise I’ll behave',
  'let’s make something',
  'boot me up, coach',
  'ready, willing, and idle',
  'lekker quiet around here',
  'sharp sharp, gimme work',
];

type Mode = 'active' | 'waiting' | 'idle';

const WORD_SETS: Record<Mode, string[]> = {
  active: ACTIVE_WORDS,
  waiting: WAITING_WORDS,
  idle: IDLE_WORDS,
};

const MODE_TINT: Record<Mode, string> = {
  active: 'var(--primary)',
  waiting: '24 95% 53%',
  idle: 'var(--destructive)',
};

function nextRandomIndex(length: number, current: number): number {
  if (length <= 1) return 0;
  let next = current;
  while (next === current) next = Math.floor(Math.random() * length);
  return next;
}

type Counts = { repos: number; agents: number; myPrs: number; teamPrs: number };

const PILLS: Array<{ key: keyof Counts; label: string; hueVar: string }> = [
  { key: 'repos', label: 'repos', hueVar: '217 91% 60%' },
  { key: 'agents', label: 'agents', hueVar: '280 65% 60%' },
  { key: 'myPrs', label: 'my PRs', hueVar: '142 71% 45%' },
  { key: 'teamPrs', label: 'team PRs', hueVar: '38 92% 50%' },
];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function Screensaver({
  onClose,
  locked = false,
}: {
  onClose: () => void;
  locked?: boolean;
}) {
  const { data: openRepos } = useRepos();
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const { data: myPullsData } = useForgePulls(selectedRepoId, true, 50, 'open', 'mine');
  const { data: teamPullsData } = useForgePulls(selectedRepoId, true, 50, 'open', 'all');

  const requirePasscode = useUiStore((s) => s.requirePasscode);
  const passcode = useUiStore((s) => s.passcode);
  const passcodeOnlyWhenLocked = useUiStore((s) => s.passcodeOnlyWhenLocked);
  const cycleDurationS = useUiStore((s) => s.cycleDurationS);
  const motion = useAppearanceStore((s) => s.motion);

  const passcodeApplies =
    requirePasscode && !!passcode && (passcodeOnlyWhenLocked ? locked : true);
  const requireCode = passcodeApplies;

  const [index, setIndex] = useState(() => Math.floor(Math.random() * ACTIVE_WORDS.length));
  const [typed, setTyped] = useState('');
  const [now, setNow] = useState(() => new Date());

  const reposCount = openRepos?.length ?? 0;
  const agentsCount = 0;
  const myPrsCount = myPullsData?.pulls?.length ?? 0;
  const teamPrsCount = teamPullsData?.pulls?.length ?? 0;

  const counts: Counts = {
    repos: reposCount,
    agents: agentsCount,
    myPrs: myPrsCount,
    teamPrs: teamPrsCount,
  };

  const mode: Mode = agentsCount > 0 ? 'active' : myPrsCount > 0 || teamPrsCount > 0 ? 'waiting' : 'idle';

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setIndex(Math.floor(Math.random() * WORD_SETS[mode].length));
  }, [mode]);

  const cycleMs = (cycleDurationS ?? 10) * 1000;

  useEffect(() => {
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
  }, [index, mode, cycleMs]);

  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  return (
    <LockScreen
      requireCode={requireCode}
      passcode={passcode ?? ''}
      onUnlock={onClose}
      onDismiss={onClose}
      animateBackground={motion !== 'reduced'}
      corners={
        <>
          <div className="absolute left-8 top-8 z-10 text-left">
            <div className="text-2xl font-semibold tracking-tight text-foreground">
              {DAYS[now.getDay()]}
            </div>
            <div className="mt-0.5 text-sm text-muted-foreground tabular-nums">
              {now.getDate()} {MONTHS[now.getMonth()]} {now.getFullYear()}
            </div>
          </div>

          <div className="absolute right-8 top-8 z-10 text-right">
            <div className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground">
              {time}
            </div>
            <div className="mt-0.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Local Time
            </div>
          </div>
        </>
      }
    >
      <div className="mb-10" style={{ '--sv-tint': MODE_TINT[mode] } as CSSProperties}>
        <Spinner mode={mode} />
      </div>

      <h1
        className="screensaver-title flex items-baseline pb-3 text-4xl font-semibold leading-[1.15] tracking-tight sm:text-6xl"
        style={{ '--sv-tint': MODE_TINT[mode] } as CSSProperties}
      >
        {typed}
        <span
          aria-hidden
          className="ml-0.5 inline-block w-[0.06em] self-stretch bg-foreground text-transparent animate-[blink_1s_step-end_infinite]"
        >
          |
        </span>
      </h1>

      <p className="mt-2 text-sm text-muted-foreground">
        {mode === 'active'
          ? 'Agents hard at work'
          : mode === 'waiting'
            ? 'PRs awaiting review and attention'
            : 'All caught up — workspace ready'}
      </p>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-2.5">
        {PILLS.map(({ key, label, hueVar }, i) => {
          const n = counts[key];
          const hue = `hsl(${hueVar})`;
          return (
            <span
              key={key}
              className="relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-border/60 bg-card/60 px-3.5 py-1.5 text-xs font-medium text-foreground/80 backdrop-blur"
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
              <span className="relative tabular-nums text-foreground">{n}</span>
              <span className="relative">{label}</span>
            </span>
          );
        })}
      </div>
    </LockScreen>
  );
}
