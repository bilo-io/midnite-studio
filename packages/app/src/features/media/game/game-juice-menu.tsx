import { GAME_JUICE_DEFAULTS, type GameJuicePatch, type GameJuiceSettings } from '@midnite/studio-shared';
import { useCallback, useEffect, useState } from 'react';
import { LuSparkles } from 'react-icons/lu';

import { SettingsSwitchRow } from '../../../components/form/settings-switch-row';
import { Popover } from '../../../components/popover';
import { bridge } from '../../../services/bridge';
import { useGameJuiceStore } from './game-juice-store';

const TOGGLES = [
  { id: 'shake', label: 'Camera shake' },
  { id: 'flash', label: 'Screen flash' },
  { id: 'particles', label: 'Particles' },
  { id: 'postfx', label: 'Post-processing' },
] as const;

/** Retry delays while a freshly started game finishes loading and installs its juice hook. */
const APPLY_RETRY_MS = [400, 1200, 3000, 6000];

/**
 * Re-apply the user's saved juice settings to a game each time it starts. The game's own hook
 * appears only once its level has loaded, so a failed apply retries a few times.
 */
export function useApplyStoredJuice(gameId: string | null, runId: string | undefined, running: boolean) {
  useEffect(() => {
    if (!gameId || !runId || !running) return;
    const patch = useGameJuiceStore.getState().byGame[gameId];
    if (!patch || Object.keys(patch).length === 0) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const attempt = async (index: number) => {
      const result = await bridge()?.games.juice({ gameId, action: 'set', patch });
      if (cancelled || result?.ok) return;
      const next = APPLY_RETRY_MS[index];
      if (next !== undefined) timers.push(setTimeout(() => void attempt(index + 1), next));
    };
    timers.push(setTimeout(() => void attempt(0), 0));
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [gameId, runId, running]);
}

/**
 * The runner toolbar's **Juice** popover: the fidelity kit's game-feel settings for the running
 * game — master switch, intensity, shake, flash, particles, post-processing and volume. Changes
 * go to the game through its `window.__midnite.juice` hook and are remembered per game.
 */
export function GameJuiceMenu({ gameId, live }: { gameId: string | null; live: boolean }) {
  const [open, setOpen] = useState(false);
  const stored = useGameJuiceStore((s) => (gameId ? s.byGame[gameId] : undefined));
  const [settings, setSettings] = useState<GameJuiceSettings>({ ...GAME_JUICE_DEFAULTS, ...stored });
  const [reachable, setReachable] = useState(true);

  // Read what the game actually has whenever the popover opens.
  useEffect(() => {
    if (!open || !gameId || !live) return;
    let cancelled = false;
    void bridge()
      ?.games.juice({ gameId, action: 'get' })
      .then((result) => {
        if (cancelled) return;
        setReachable(result.ok);
        if (result.ok) setSettings(result.value);
      });
    return () => {
      cancelled = true;
    };
  }, [open, gameId, live]);

  const change = useCallback(
    (patch: GameJuicePatch) => {
      if (!gameId) return;
      setSettings((current) => ({ ...current, ...patch }));
      useGameJuiceStore.getState().setPatch(gameId, patch);
      if (live) void bridge()?.games.juice({ gameId, action: 'set', patch });
    },
    [gameId, live],
  );

  const reset = () => {
    if (!gameId) return;
    useGameJuiceStore.getState().reset(gameId);
    setSettings({ ...GAME_JUICE_DEFAULTS });
    if (live) void bridge()?.games.juice({ gameId, action: 'reset' });
  };

  const off = !settings.enabled;
  return (
    <Popover
      label="Juice"
      title="Game feel: shake, flash, particles, post-processing and sound"
      side="bottom"
      align="end"
      disabled={!gameId}
      open={open}
      onOpenChange={setOpen}
      triggerClassName="flex h-7 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
      trigger={
        <>
          <LuSparkles aria-hidden className="size-3.5" />
          Juice
        </>
      }
      panelClassName="w-72"
    >
      <div className="flex flex-col gap-1 p-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-foreground">Juice</span>
          <button
            type="button"
            className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={reset}
          >
            Reset
          </button>
        </div>
        {!live ? (
          <p className="text-muted-foreground">The game is not running. These apply the next time it starts.</p>
        ) : !reachable ? (
          <p className="text-muted-foreground">This game has no juice settings (it predates kit 0.10.0).</p>
        ) : null}
        <SettingsSwitchRow
          id="enabled"
          label="Juice"
          description="Master switch for every effect below"
          on={settings.enabled}
          onToggle={(_id, on) => change({ enabled: on })}
        />
        <Slider label="Intensity" min={0} max={2} step={0.05} value={settings.intensity} disabled={off} format={(v) => `${Math.round(v * 100)}%`} onChange={(intensity) => change({ intensity })} />
        {TOGGLES.map((t) => (
          <SettingsSwitchRow
            key={t.id}
            id={t.id}
            label={t.label}
            on={settings[t.id]}
            disabled={off}
            onToggle={(_id, on) => change({ [t.id]: on })}
          />
        ))}
        <Slider label="Volume" min={0} max={1} step={0.05} value={settings.volume} disabled={off} format={(v) => `${Math.round(v * 100)}%`} onChange={(volume) => change({ volume })} />
      </div>
    </Popover>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  disabled,
  format,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  disabled: boolean;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className={`flex items-center gap-2 px-2 py-1 ${disabled ? 'opacity-50' : ''}`}>
      <span className="w-16 text-foreground">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary"
      />
      <span className="w-9 text-right text-muted-foreground tabular-nums">{format(value)}</span>
    </label>
  );
}
