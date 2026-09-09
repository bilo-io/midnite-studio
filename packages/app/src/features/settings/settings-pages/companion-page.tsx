import {
  COMPANION_PHRASES,
  CompanionNamesSchema,
  STT_PROVIDER_IDS,
  STT_PROVIDER_LABELS,
  interpolatePhrase,
  pickPhrase,
  type SttProviderId,
} from '@midnite/studio-shared';
import { Accordion } from '@bilo-io/ui';
import { useCallback, useEffect, useState } from 'react';
import {
  LuBot,
  LuCircleCheck,
  LuDownload,
  LuMic,
  LuRefreshCw,
  LuSmile,
  LuTriangleAlert,
  LuVolume2,
  LuX,
} from 'react-icons/lu';

import { setCompanionVolume as applyCompanionVolume } from '../../companion/audio/context';
import { companionTtsSpeaker } from '../../companion/speaker';
import { refreshMicAvailability } from '../../companion/voice-ports';
import { IconButton } from '../../../components/icon-button';
import { bridge } from '../../../services/bridge';
import { useUiStore } from '../../../store/ui-store';
import { Choice, Field, TextField } from './controls';

/**
 * Settings ▸ Companion (Phase 79 Theme H) — the page the five `companion*`
 * preferences were parked in `persisted-keys.ts`'s `KNOWN_ORPHANS` waiting
 * for. Landing it is what let that PR *delete* all five entries rather than
 * widen the list, which is the lifecycle that list's own doc comment
 * prescribes.
 *
 * Shaped after `git-safety-page.tsx`: a default-off master switch with its
 * real consequences written out under it, and a second, separately-gated
 * switch for the part that actually presses keys in a terminal. Three switches
 * rather than one is the phase's own guardrail — hearing the companion, giving
 * it a microphone and letting it hit Return are three different decisions.
 *
 * Theme H shipped this page with two sections deliberately thinner than the
 * doc describes — the voice preview and volume needed Theme F's `speaker.ts`
 * and Theme G's master gain, and the microphone row needed Theme F's provider
 * seam and its `safeStorage` credential file. **Themes F and G filled both
 * in**: the "Say hello" preview and the locale filter, the Companion volume
 * slider, and the whole Microphone section (provider, masked key, Test,
 * hold-or-tap).
 *
 * The key field is the one control on this page that never reads its own
 * value back. `companion.sttSet` sends it one way into `safeStorage`, and
 * `companion.sttStatus` answers with a boolean per provider — there is no
 * channel that returns a stored key, so the field renders empty on every
 * visit and a stored key is reported as a line of text beside it. That is the
 * whole design, not a limitation: a key that can be read back out is a key
 * that a renderer bug can leak.
 */
export function CompanionPage() {
  const companionEnabled = useUiStore((s) => s.companionEnabled);
  const setCompanionEnabled = useUiStore((s) => s.setCompanionEnabled);
  const companionHandsFree = useUiStore((s) => s.companionHandsFree);
  const setCompanionHandsFree = useUiStore((s) => s.setCompanionHandsFree);
  const companionHonorific = useUiStore((s) => s.companionHonorific);
  const setCompanionHonorific = useUiStore((s) => s.setCompanionHonorific);
  const companionNames = useUiStore((s) => s.companionNames);
  const setCompanionNames = useUiStore((s) => s.setCompanionNames);
  const companionVoice = useUiStore((s) => s.companionVoice);
  const setCompanionVoice = useUiStore((s) => s.setCompanionVoice);
  const companionSpeakAloud = useUiStore((s) => s.companionSpeakAloud);
  const setCompanionSpeakAloud = useUiStore((s) => s.setCompanionSpeakAloud);
  const companionMusicOffer = useUiStore((s) => s.companionMusicOffer);
  const setCompanionMusicOffer = useUiStore((s) => s.setCompanionMusicOffer);

  const companionVolume = useUiStore((s) => s.companionVolume);
  const setCompanionVolume = useUiStore((s) => s.setCompanionVolume);
  const companionMicMode = useUiStore((s) => s.companionMicMode);
  const setCompanionMicMode = useUiStore((s) => s.setCompanionMicMode);

  const [showAllVoices, setShowAllVoices] = useState(false);
  const voices = useSpeechVoices();
  const locale = typeof navigator === 'undefined' ? 'en' : (navigator.language ?? 'en');
  const language = (locale.split('-')[0] ?? 'en').toLowerCase();
  /*
    Filtered to the app locale by default, per the phase doc. macOS ships
    dozens of voices in languages the app does not speak, and a list of sixty
    is a list nobody scrolls — but the filter has to be escapable, because a
    bilingual user's preferred voice is a legitimate choice the locale cannot
    predict.
  */
  const localeVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith(language));
  const shownVoices = showAllVoices || localeVoices.length === 0 ? voices : localeVoices;

  /*
    The volume node lives in `audio/context.ts`, not in the store: the store
    persists the number and this effect is what makes the live master gain
    agree with it — on mount as well as on change, because a relaunch restores
    the preference into a context that has never been told about it.
  */
  useEffect(() => {
    applyCompanionVolume(companionVolume);
  }, [companionVolume]);

  const { status: ttsStatus, retry: retryTtsStatus } = useCompanionTtsStatus();
  /*
    Which engine actually spoke the most recent preview — or would speak the
    next one, before any has run this session. `companionTtsSpeaker` is a
    module singleton whose `activeEngine` getter isn't itself observable, so
    this mirrors it into state at the two moments it can change: right after
    a "Say hello" attempt, and right after Retry resets the sticky fallback.
  */
  const [rendererEngine, setRendererEngine] = useState<'local' | 'system'>(
    () => companionTtsSpeaker.activeEngine,
  );

  const sayHello = useCallback(() => {
    const greeting = pickPhrase(COMPANION_PHRASES.greetings);
    void (async () => {
      await companionTtsSpeaker.speak(interpolatePhrase(greeting, companionHonorific));
      setRendererEngine(companionTtsSpeaker.activeEngine);
    })();
  }, [companionHonorific]);

  const retryLocalVoice = useCallback(() => {
    // Order matters: reset the renderer's own sticky fallback first so the
    // very next "Say hello" tries the local engine again, then ask main for
    // a fresh provisioning attempt if the download is what failed.
    companionTtsSpeaker.retryLocalVoice();
    setRendererEngine(companionTtsSpeaker.activeEngine);
    void retryTtsStatus();
  }, [retryTtsStatus]);

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="Companion" icon={<LuBot className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <Field
            label="Enable companion"
            hint="Adds a chat panel beside the Loops panel, a Companion row to the quick-access menu, and lets the app speak. Off by default: it greets you out loud when the panel opens, and an app that talks unprompted has to be asked for."
          >
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={companionEnabled}
                onChange={(event) => setCompanionEnabled(event.target.checked)}
                className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                data-testid="companion-enable"
              />
              Enable companion
            </label>
          </Field>
        </div>
      </Accordion>

      <Accordion title="Voice" icon={<LuVolume2 className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          {/*
            Above the voice picker, because it is the switch that decides
            whether the picker matters at all — and the only `companion*`
            switch that starts on. Phase 79 landed with `setCompanionSpeaker`
            uncalled, so the companion was mute with no control to say so; this
            is that control, and its default is what makes an enabled companion
            audible.
          */}
          <Field
            label="Speak replies aloud"
            hint="On by default: enabling the companion is the decision to be spoken to. Turn it off to keep the thread, the greeting and the routing while the app stays silent — a shared office, or a call. Nothing else changes; every turn is still written into the thread."
          >
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={companionSpeakAloud}
                onChange={(event) => setCompanionSpeakAloud(event.target.checked)}
                disabled={!companionEnabled}
                className="h-3.5 w-3.5 accent-[hsl(var(--primary))] disabled:opacity-50"
                data-testid="companion-speak-aloud"
              />
              Speak replies aloud
            </label>
          </Field>

          {/*
            Phase 80 Theme C: the companion now tries a bundled local voice
            (downloaded once, on first use) before falling back to the system
            voices below — automatically, with no switch here, because the
            fallback is per-utterance and never leaves the companion mute.
            The picker below still governs the *fallback* voice only.
          */}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            The companion speaks with a bundled offline voice when it can, falling back
            automatically to one of the system voices below if the local voice is unavailable on
            this machine.
          </p>

          <CompanionVoiceStatus status={ttsStatus} rendererEngine={rendererEngine} onRetry={retryLocalVoice} />

          <Field
            label="Speaking voice (fallback)"
            hint="One of the voices your operating system already ships — no download, no network. Used automatically if the local voice can't load. Say hello below tries the local voice first and falls back to this one."
          >
            <select
              value={companionVoice ?? ''}
              onChange={(event) =>
                setCompanionVoice(event.target.value === '' ? null : event.target.value)
              }
              aria-label="Speaking voice"
              data-testid="companion-voice"
              className="w-full rounded-md border border-input bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">System default</option>
              {shownVoices.map((voice) => (
                <option key={voice.uri} value={voice.uri}>
                  {voice.label}
                </option>
              ))}
            </select>
            {voices.length === 0 ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                No voices reported yet. The list arrives asynchronously on some systems — reopen
                this page if it stays empty.
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={sayHello}
                /*
                  Only "no voices reported yet" AND the local engine isn't
                  ready should block this — the local engine needs neither a
                  system voice list nor a working `speechSynthesis` at all.
                  Gating on `voices.length === 0` alone (Finding 2) disabled
                  the one control that could prove the local voice worked on a
                  machine that also happens to report zero system voices.
                */
                disabled={
                  !companionEnabled ||
                  !companionSpeakAloud ||
                  (voices.length === 0 && ttsStatus?.voice !== 'ready')
                }
                className="h-6 rounded-md border border-border px-2 text-xs transition-colors hover:bg-accent disabled:opacity-50"
                data-testid="companion-say-hello"
              >
                Say hello
              </button>
              {localeVoices.length > 0 && localeVoices.length < voices.length ? (
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={showAllVoices}
                    onChange={(event) => setShowAllVoices(event.target.checked)}
                    className="h-3 w-3 accent-[hsl(var(--primary))]"
                    data-testid="companion-show-all-voices"
                  />
                  Show all {voices.length} voices
                </label>
              ) : null}
            </div>
            <p className="text-[11px] text-muted-foreground" data-testid="companion-say-hello-engine">
              {rendererEngine === 'local'
                ? 'Say hello uses the local offline voice.'
                : 'Say hello uses the system voice above.'}
            </p>
          </Field>

          <Field
            label="Companion volume"
            hint="How loudly the companion's own sounds play — the whistling and the elevator music it offers on a long wait. It does not change the speaking voice, which uses your system volume."
          >
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(companionVolume * 100)}
                onChange={(event) => setCompanionVolume(Number(event.target.value) / 100)}
                aria-label="Companion volume"
                data-testid="companion-volume"
                className="h-1.5 w-40 accent-[hsl(var(--primary))]"
              />
              <span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground">
                {Math.round(companionVolume * 100)}%
              </span>
            </div>
          </Field>
        </div>
      </Accordion>

      <Accordion title="Microphone" icon={<LuMic className="h-4 w-4" />}>
        <div className="flex flex-col gap-4 p-3">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Chromium&apos;s own recogniser does not work in Electron — it routes to a Google
            service this app ships no key for — so speaking to the companion needs a provider,
            with its key held in the OS keychain. Until one is set up the microphone button in the
            companion panel stays disabled and everything else works as normal: the companion
            still greets, grounds, routes and reads back. Typing is the input.
          </p>

          <SttCredentialFields disabled={!companionEnabled} />

          <Choice<'push' | 'toggle'>
            label="Microphone button"
            hint="Hold to talk is the default because it cannot leave the microphone open — letting go is the same gesture as stopping. Tap to toggle suits a long dictation, or a hand that cannot hold a button."
            value={companionMicMode}
            onChange={setCompanionMicMode}
            options={[
              ['push', 'Hold to talk', 'Records while the mic button (or Space) is held down'],
              ['toggle', 'Tap to toggle', 'One tap starts recording, the next one stops it'],
            ]}
          />
        </div>
      </Accordion>

      <Accordion title="Hands-free run" icon={<LuBot className="h-4 w-4" />}>
        <div className="flex flex-col gap-4 p-3">
          <Field
            label="Let the companion press Return"
            hint="Without this, a command the companion prepares is typed into a new agent session and left there for you to send. With it, the companion sends it itself — after saying out loud which command it is about to run."
          >
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={companionHandsFree}
                onChange={(event) => setCompanionHandsFree(event.target.checked)}
                disabled={!companionEnabled}
                className="h-3.5 w-3.5 accent-[hsl(var(--primary))] disabled:opacity-50"
                data-testid="companion-hands-free"
              />
              Allow hands-free run
            </label>
          </Field>

          <div className="space-y-1.5 rounded-md border border-border/60 bg-card/50 p-3 text-[11px] text-muted-foreground">
            <p className="font-medium text-foreground">What this still never does</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>
                No command outside the agent skills this app already knows — there is no
                &ldquo;commit this&rdquo; and no &ldquo;push&rdquo;. Every write still happens
                inside an agent session you can watch.
              </li>
              <li>
                No silent send: the companion speaks the command before it runs it, so the thing
                about to happen is said out loud first.
              </li>
              <li>
                Nothing at all while the microphone is unconfigured — a hands-free run needs both
                switches, and this one alone changes nothing.
              </li>
            </ul>
          </div>
        </div>
      </Accordion>

      <Accordion title="Personality" icon={<LuSmile className="h-4 w-4" />}>
        <div className="flex flex-col gap-4 p-3">
          <CompanionNamesField names={companionNames} onChange={setCompanionNames} />

          <Field
            label="What it calls you"
            hint="Dropped into greetings and sign-offs. Empty by default, and empty reads correctly — the phrase collapses the punctuation that was only there to set the name off, so it says “Okay, here we are” rather than “Okay , here we are”."
          >
            <TextField
              value={companionHonorific}
              onChange={setCompanionHonorific}
              label="What it calls you"
              placeholder="sir, Ada, boss…"
            />
          </Field>

          <Field
            label="Offer music on a long wait"
            hint="After twenty seconds of waiting on an agent the companion asks whether you would like something to listen to. It only ever offers — nothing plays unless you say yes."
          >
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={companionMusicOffer}
                onChange={(event) => setCompanionMusicOffer(event.target.checked)}
                disabled={!companionEnabled}
                className="h-3.5 w-3.5 accent-[hsl(var(--primary))] disabled:opacity-50"
                data-testid="companion-music-offer"
              />
              Offer elevator music
            </label>
          </Field>
        </div>
      </Accordion>
    </div>
  );
}

/**
 * Structurally the value `mstudio:companion:tts-status` answers with
 * (`schemas.CompanionTtsStatusResponse`'s success arm, unwrapped).
 *
 * Declared here rather than imported for the reason `speaker.ts`'s own
 * `CompanionSpeakOptions` doc gives: `app` may not import `desktop` (package
 * boundaries), and the shared schema's inferred type is a zod internal, not
 * something worth threading through `@midnite/studio-shared`'s public surface
 * for one caller. The shape is a straight mirror — see `tts.ts`'s
 * `CompanionTtsStatusValue` for the source of truth.
 */
type CompanionTtsStatusValue = {
  engine: 'local' | 'system';
  voice: 'idle' | 'downloading' | 'ready' | 'failed';
  reason: 'native-module-missing' | 'download-failed' | 'synthesis-error' | null;
  message: string | null;
};

/**
 * Polls `companion.ttsStatus` (Phase 80 Theme C follow-up) — once on mount,
 * which is what starts the one-time ~77 MB download if the voice isn't
 * provisioned yet (see `getCompanionTtsStatus`'s own doc), then every 1.5 s
 * while it answers `'downloading'`, stopping once it lands on `'ready'` or
 * `'failed'`. `retry` re-checks with `retry: true`, forcing a fresh
 * provisioning attempt after a prior download failure.
 */
function useCompanionTtsStatus(): {
  status: CompanionTtsStatusValue | null;
  retry: () => void;
} {
  const [status, setStatus] = useState<CompanionTtsStatusValue | null>(null);

  const check = useCallback(async (retry = false) => {
    const companion = bridge()?.companion;
    if (!companion?.ttsStatus) return;
    const result = await companion.ttsStatus({ retry });
    if (result.ok) setStatus(result.value);
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  useEffect(() => {
    if (status?.voice !== 'downloading') return undefined;
    const timer = setInterval(() => void check(), 1_500);
    return () => clearInterval(timer);
  }, [status?.voice, check]);

  return { status, retry: useCallback(() => void check(true), [check]) };
}

/** Shared styling for the two moments this section offers a way to try again. */
function RetryButton({ onClick, label, testId }: { onClick: () => void; label: string; testId: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex w-fit items-center gap-1 h-6 rounded-md border border-border px-2 text-xs transition-colors hover:bg-accent"
      data-testid={testId}
    >
      <LuRefreshCw className="h-3 w-3" />
      {label}
    </button>
  );
}

/** `reason` → the sentence explaining it, one per `tts.ts` failure mode (module doc). */
const TTS_FAILURE_SENTENCES: Record<NonNullable<CompanionTtsStatusValue['reason']>, string> = {
  'native-module-missing': "The local voice engine isn't available on this machine",
  'download-failed': 'Could not download the local voice',
  'synthesis-error': 'The local voice failed to start',
};

/**
 * The live diagnosis Finding 1 asked for: which engine is speaking right
 * now, and — when it fell back — why, distinguishing all three of
 * `synthesizeSpeech`'s failure modes rather than one generic "unavailable".
 *
 * `status` is main's own view of the local engine's health; `rendererEngine`
 * is this renderer's separate, session-local fallback decision
 * (`companionTtsSpeaker.activeEngine`) — the two can disagree, e.g. main
 * finished a delayed download after this session had already fallen back to
 * the system voice for an earlier utterance, which is exactly the case
 * `onRetry` (`companionTtsSpeaker.retryLocalVoice()` plus a fresh status
 * check) exists to recover from without a restart.
 */
function CompanionVoiceStatus({
  status,
  rendererEngine,
  onRetry,
}: {
  status: CompanionTtsStatusValue | null;
  rendererEngine: 'local' | 'system';
  onRetry: () => void;
}) {
  if (status === null || status.voice === 'idle') {
    return (
      <p className="text-[11px] leading-relaxed text-muted-foreground" data-testid="companion-voice-status">
        Checking the local offline voice…
      </p>
    );
  }

  if (status.voice === 'downloading') {
    return (
      <p
        className="flex items-center gap-1.5 text-[11px] leading-relaxed text-muted-foreground"
        data-testid="companion-voice-status"
      >
        <LuDownload className="h-3 w-3 shrink-0" />
        Downloading the local offline voice (about 77 MB, one time only)…
      </p>
    );
  }

  if (status.voice === 'ready') {
    if (rendererEngine === 'local') {
      return (
        <p
          className="flex items-center gap-1.5 text-[11px] leading-relaxed text-muted-foreground"
          data-testid="companion-voice-status"
        >
          <LuCircleCheck className="h-3 w-3 shrink-0 text-emerald-500" />
          Speaking with the local offline voice — no network, no system voice.
        </p>
      );
    }
    return (
      <div className="flex flex-col items-start gap-1.5" data-testid="companion-voice-status">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          The local voice is ready, but this session already switched to the system voice below.
        </p>
        <RetryButton
          onClick={onRetry}
          label="Use the local voice again"
          testId="companion-voice-retry"
        />
      </div>
    );
  }

  // status.voice === 'failed'
  const sentence = TTS_FAILURE_SENTENCES[status.reason ?? 'native-module-missing'];
  return (
    <div className="flex flex-col items-start gap-1.5" data-testid="companion-voice-status">
      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <LuTriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
        <span>
          {sentence}
          {status.message ? ` (${status.message})` : ''}. Using a system voice instead.
        </span>
      </p>
      {/*
        Only the download failure is retryable — a missing native module and
        a synthesis-throw are sticky for the main process's lifetime (the
        module doc's own claim); offering Retry there would promise a fix
        this button cannot deliver.
      */}
      {status.reason === 'download-failed' ? (
        <RetryButton onClick={onRetry} label="Retry download" testId="companion-voice-retry" />
      ) : null}
    </div>
  );
}

/** Matches `TextField`'s own styling constant (`field.tsx:87`) — not exported, so restated here rather than editing that file for one more caller. */
const NAME_INPUT_CLASSNAME =
  'w-full rounded-md border border-input bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring disabled:opacity-50';

/**
 * The pill list of names the companion answers to (Phase 80 Theme D).
 *
 * A raw `<input>` sharing `TextField`'s styling constant rather than
 * `TextField` itself — Enter-to-commit and Backspace-to-delete-last need
 * `onKeyDown`, which `TextField` doesn't take, and threading a new prop
 * through a shared primitive for this one caller would be worse than the
 * five extra lines here (phase doc, Decision 7).
 *
 * No tag/token input exists in `@bilo-io/ui` (confirmed against its
 * `dist/index.d.ts`), so this is composed from primitives that already
 * exist: the input's own styling, and `IconButton` for each pill's remove
 * control — `LuX` from `react-icons/lu`, never `lucide-react`.
 */
function CompanionNamesField({
  names,
  onChange,
}: {
  names: string[];
  onChange: (names: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const commitDraft = useCallback(() => {
    const candidate = draft.trim();
    if (candidate === '') return;
    if (names.some((name) => name.toLowerCase() === candidate.toLowerCase())) {
      setError(`"${candidate}" is already one of its names.`);
      return;
    }
    const result = CompanionNamesSchema.safeParse([...names, candidate]);
    if (!result.success) {
      setError('That name is not valid.');
      return;
    }
    onChange(result.data);
    setDraft('');
    setError(null);
  }, [draft, names, onChange]);

  const removeName = useCallback(
    (name: string) => {
      if (names.length <= 1) return; // Decision 6: block, never silently backfill a default.
      onChange(names.filter((existing) => existing !== name));
      setError(null);
    },
    [names, onChange],
  );

  return (
    <Field
      label="What you call it"
      hint="Every name below wakes the companion — typed or spoken. At least one name is always required, so the last one can't be removed."
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5" data-testid="companion-names-pills">
          {names.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pl-2.5 pr-1 text-xs text-foreground"
            >
              {name}
              <IconButton
                icon={LuX}
                label={`Remove "${name}"`}
                size="sm"
                onClick={() => removeName(name)}
                disabled={names.length <= 1}
                disabledReason={names.length <= 1 ? 'The companion needs at least one name' : undefined}
              />
            </span>
          ))}
        </div>
        <input
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitDraft();
            } else if (event.key === 'Backspace' && draft === '' && names.length > 1) {
              removeName(names[names.length - 1] as string);
            }
          }}
          aria-label="Add a name"
          placeholder="Type a name and press Enter…"
          className={NAME_INPUT_CLASSNAME}
          data-testid="companion-names-input"
        />
        {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
      </div>
    </Field>
  );
}

/**
 * Provider, key, Test — the three controls the STT seam needs (Theme F).
 *
 * A component of its own rather than three more hooks on the page, because it
 * is the only part of this page with an async round trip and a status of its
 * own. Everything else here is a store field and a checkbox.
 *
 * **The key is write-only.** `sttSet` sends it one way into `safeStorage` and
 * `sttStatus` answers with a boolean per provider — no channel returns a
 * stored key, so the field renders empty on every visit and "a key is stored"
 * is a line of text beside it. A key that can be read back out is a key a
 * renderer bug can leak.
 */
function SttCredentialFields({ disabled }: { disabled: boolean }) {
  const [provider, setProvider] = useState<SttProviderId>(STT_PROVIDER_IDS[0]);
  const [key, setKey] = useState('');
  const [configured, setConfigured] = useState<SttProviderId[]>([]);
  const [encryptionAvailable, setEncryptionAvailable] = useState(true);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const companion = bridge()?.companion;
    if (!companion?.sttStatus) return;
    const next = await companion.sttStatus();
    setConfigured(next.configured);
    setEncryptionAvailable(next.encryptionAvailable);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async () => {
    const companion = bridge()?.companion;
    if (!companion?.sttSet) return;
    setBusy(true);
    setStatus(null);
    const result = await companion.sttSet({ providerId: provider, key });
    setBusy(false);
    // Cleared, not saved, when the field was empty — the same gesture means
    // "forget this", which is why there is no separate delete control.
    const cleared = key.trim().length === 0;
    setStatus(
      result.ok
        ? { kind: 'ok', text: cleared ? 'Key cleared.' : 'Key saved to the OS keychain.' }
        : { kind: 'error', text: result.kind === 'error' ? result.message : 'Could not save.' },
    );
    setKey('');
    await refresh();
    /*
      The panel's mic button reads a cached "is a key stored" — saving one here
      is the whole reason that cache can be wrong, so it is invalidated at the
      one moment it changes rather than on a timer.
    */
    await refreshMicAvailability();
  };

  const test = async () => {
    const companion = bridge()?.companion;
    if (!companion?.sttTest) return;
    setBusy(true);
    setStatus(null);
    const result = await companion.sttTest({ providerId: provider });
    setBusy(false);
    setStatus(
      result.ok
        ? // An empty transcript is a pass: the point of the Test is the
          // 401/429/DNS failure it rules out, not what a second of silence
          // transcribes to.
          { kind: 'ok', text: `Reached the provider in ${result.value.ms} ms.` }
        : { kind: 'error', text: result.kind === 'error' ? result.message : 'Test failed.' },
    );
  };

  const stored = configured.includes(provider);

  return (
    <>
      <Field
        label="Provider"
        hint="Which service transcribes what you say. OpenAI Whisper takes the recording as-is, one request per utterance; the audio leaves this machine only while you are holding the microphone button."
      >
        <select
          value={provider}
          onChange={(event) => setProvider(event.target.value as SttProviderId)}
          disabled={disabled}
          aria-label="Speech provider"
          data-testid="companion-stt-provider"
          className="w-full rounded-md border border-input bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        >
          {STT_PROVIDER_IDS.map((id) => (
            <option key={id} value={id}>
              {STT_PROVIDER_LABELS[id]}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="API key"
        hint="Held in the OS keychain through Electron's safeStorage, never in the app's own storage and never sent to the renderer. Leave it empty and press Save to forget a stored key."
      >
        <div className="flex flex-col gap-2">
          <input
            type="password"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            disabled={disabled || busy}
            placeholder={stored ? 'A key is stored — type to replace it' : 'sk-…'}
            aria-label="API key"
            data-testid="companion-stt-key"
            className="w-full rounded-md border border-input bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={disabled || busy}
              className="h-6 rounded-md border border-border px-2 text-xs transition-colors hover:bg-accent disabled:opacity-50"
              data-testid="companion-stt-save"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => void test()}
              disabled={disabled || busy || !stored}
              title={stored ? 'Send one second of silence and report the round-trip' : 'Save a key first'}
              className="h-6 rounded-md border border-border px-2 text-xs transition-colors hover:bg-accent disabled:opacity-50"
              data-testid="companion-stt-test"
            >
              Test
            </button>
            <span className="text-[11px] text-muted-foreground" data-testid="companion-stt-stored">
              {stored ? 'A key is stored for this provider.' : 'No key stored.'}
            </span>
          </div>
          {status === null ? null : (
            <p
              className={`text-[11px] leading-relaxed ${
                status.kind === 'ok' ? 'text-muted-foreground' : 'text-destructive'
              }`}
              role={status.kind === 'error' ? 'alert' : undefined}
              data-testid="companion-stt-status"
            >
              {status.text}
            </p>
          )}
          {encryptionAvailable ? null : (
            <p className="text-[11px] leading-relaxed text-destructive">
              This machine has no working keychain, so a key can only be held for this session and
              has to be entered again after a relaunch.
            </p>
          )}
        </div>
      </Field>
    </>
  );
}

/** `lang` is carried as well as the label so the locale filter has something to read. */
type VoiceOption = { uri: string; label: string; lang: string };

/**
 * The system's speech voices, as `{ uri, label }` pairs.
 *
 * `getVoices()` is famously empty on first call in Chromium — the list is
 * populated asynchronously and announced with a `voiceschanged` event — so
 * this reads it once *and* subscribes, rather than trusting either alone. A
 * page that only read it synchronously would show "System default" and nothing
 * else on a cold renderer, which looks like the OS has no voices.
 *
 * `voiceURI` is the stored value rather than `name`: two installed voices can
 * share a name across languages, and the URI is what `speechSynthesis` itself
 * matches on.
 */
function useSpeechVoices(): VoiceOption[] {
  const [voices, setVoices] = useState<VoiceOption[]>([]);

  useEffect(() => {
    const synth = typeof window === 'undefined' ? undefined : window.speechSynthesis;
    if (!synth) return undefined;

    const read = () => {
      setVoices(
        synth.getVoices().map((voice) => ({
          uri: voice.voiceURI,
          lang: voice.lang,
          label: `${voice.name} (${voice.lang})${voice.default ? ' — default' : ''}`,
        })),
      );
    };

    read();
    synth.addEventListener('voiceschanged', read);
    return () => synth.removeEventListener('voiceschanged', read);
  }, []);

  return voices;
}
