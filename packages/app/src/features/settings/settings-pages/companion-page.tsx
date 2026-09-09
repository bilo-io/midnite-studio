import {
  COMPANION_LOCAL_VOICES,
  COMPANION_PHRASES,
  CompanionHonorificsSchema,
  CompanionNamesSchema,
  STT_PROVIDERS_WITHOUT_KEY,
  STT_PROVIDER_IDS,
  STT_PROVIDER_LABELS,
  interpolatePhrase,
  pickHonorific,
  pickPhrase,
  type SttProviderId,
} from '@midnite/studio-shared';
import { Accordion } from '@bilo-io/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LuBot,
  LuCircleCheck,
  LuDownload,
  LuMic,
  LuPlay,
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
import { Choice, Field, TextArea } from './controls';

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
  const companionHonorifics = useUiStore((s) => s.companionHonorifics);
  const setCompanionHonorifics = useUiStore((s) => s.setCompanionHonorifics);
  const companionNames = useUiStore((s) => s.companionNames);
  const setCompanionNames = useUiStore((s) => s.setCompanionNames);
  const companionPersonality = useUiStore((s) => s.companionPersonality);
  const setCompanionPersonality = useUiStore((s) => s.setCompanionPersonality);
  const companionAboutUser = useUiStore((s) => s.companionAboutUser);
  const setCompanionAboutUser = useUiStore((s) => s.setCompanionAboutUser);
  const companionVoices = useUiStore((s) => s.companionVoices);
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

  const {
    status: ttsStatus,
    retry: retryTtsStatus,
    reload: reloadTtsStatus,
    reloading: ttsReloading,
  } = useCompanionTtsStatus();
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
      await companionTtsSpeaker.speak(interpolatePhrase(greeting, pickHonorific(companionHonorifics)));
      setRendererEngine(companionTtsSpeaker.activeEngine);
    })();
  }, [companionHonorifics]);

  const retryLocalVoice = useCallback(() => {
    // Order matters: reset the renderer's own sticky fallback first so the
    // very next "Say hello" tries the local engine again, then ask main for
    // a fresh provisioning attempt if the download is what failed.
    companionTtsSpeaker.retryLocalVoice();
    setRendererEngine(companionTtsSpeaker.activeEngine);
    void retryTtsStatus();
  }, [retryTtsStatus]);

  /**
   * Ad Hoc "the local voice engine crashed" — the reload button's handler.
   * Same ordering as `retryLocalVoice` above and for the same reason: reset
   * the renderer's own sticky fallback first (optimistic, exactly as retry
   * already is — a `speak()` that fails again flips it right back), THEN
   * kick off the real round trip to main, whose awaited result is what
   * `ttsStatus` actually refreshes from.
   */
  const reloadLocalEngine = useCallback(() => {
    companionTtsSpeaker.reloadLocalVoice();
    setRendererEngine(companionTtsSpeaker.activeEngine);
    reloadTtsStatus();
  }, [reloadTtsStatus]);

  /**
   * Preview one engine specifically — Ad Hoc: each engine now has its own
   * voice picker, so the button beside each one has to reach *that* engine
   * even when this session already fell back to the other (`sayHello` above
   * follows the local-first fallback order instead, which is the right
   * behaviour for the *overall* preview but the wrong one for "does this
   * particular local voice sound right").
   */
  const previewEngine = useCallback(
    (engine: 'local' | 'system') => {
      const greeting = pickPhrase(COMPANION_PHRASES.greetings);
      void companionTtsSpeaker.speakWithEngine(
        engine,
        interpolatePhrase(greeting, pickHonorific(companionHonorifics)),
      );
    },
    [companionHonorifics],
  );

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="Companion" icon={<LuBot className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <Field
            label="Enable companion"
            hint="Adds a chat panel and a quick-access row, and lets the app speak. Off by default — an app that talks unprompted has to be asked for."
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
            hint="On by default. Turn off to keep the thread and routing silent — a shared office, a call."
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

          <CompanionVoiceStatus
            status={ttsStatus}
            rendererEngine={rendererEngine}
            onRetry={retryLocalVoice}
            onReload={reloadLocalEngine}
            reloading={ttsReloading}
          />

          <Field label="Local voice" hint="Which of Kokoro's bundled voices to use once it's ready.">
            <select
              value={companionVoices.local ?? ''}
              onChange={(event) =>
                setCompanionVoice('local', event.target.value === '' ? null : event.target.value)
              }
              aria-label="Local voice"
              data-testid="companion-voice-local"
              className="w-full rounded-md border border-input bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Default — Heart</option>
              {COMPANION_LOCAL_VOICES.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name} — {voice.language === 'en-us' ? 'American' : 'British'}, {voice.gender}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => previewEngine('local')}
                disabled={!companionEnabled || ttsStatus?.voice !== 'ready'}
                title="Speak a line through the local voice specifically"
                className="inline-flex items-center gap-1 h-6 rounded-md border border-border px-2 text-xs transition-colors hover:bg-accent disabled:opacity-50"
                data-testid="companion-voice-preview-local"
              >
                <LuPlay className="h-3 w-3" />
                Preview
              </button>
            </div>
          </Field>

          <Field
            label="Speaking voice (fallback)"
            hint="One of your operating system's voices — used automatically if the local voice can't load."
          >
            <select
              value={companionVoices.system ?? ''}
              onChange={(event) =>
                setCompanionVoice('system', event.target.value === '' ? null : event.target.value)
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
                No voices reported yet — reopen this page if the list stays empty.
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
              <button
                type="button"
                onClick={() => previewEngine('system')}
                disabled={!companionEnabled || voices.length === 0}
                title="Speak a line through the system voice specifically"
                className="inline-flex items-center gap-1 h-6 rounded-md border border-border px-2 text-xs transition-colors hover:bg-accent disabled:opacity-50"
                data-testid="companion-voice-preview-system"
              >
                <LuPlay className="h-3 w-3" />
                Preview
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
            hint="Volume for the companion's whistle and elevator music — not the speaking voice, which uses system volume."
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
            Chromium&apos;s recogniser doesn&apos;t work in Electron, so the mic uses a built-in
            offline engine instead — no key, no account, just a small one-time download. OpenAI
            Whisper below is an optional cloud alternative for anyone who already has a key.
          </p>

          <SttCredentialFields disabled={!companionEnabled} />

          <Choice<'push' | 'toggle'>
            label="Microphone button"
            hint="Hold to talk can't leave the mic open by accident. Tap to toggle suits a long dictation."
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
            hint="Off: a prepared command is typed but left for you to send. On: the companion sends it itself, after saying which command out loud."
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
                No git write except the same push, pull and commit the palette offers — and each
                one asks first, hands-free or not.
              </li>
              <li>No dialog is ever answered for you.</li>
              <li>No silent send: the companion speaks the command before it runs it.</li>
              <li>Nothing while the microphone is unconfigured — a hands-free run needs both switches.</li>
            </ul>
          </div>
        </div>
      </Accordion>

      <Accordion title="Personality" icon={<LuSmile className="h-4 w-4" />}>
        <div className="flex flex-col gap-4 p-3">
          <PillListField
            label="What you call it"
            hint="Wakes the companion, typed or spoken. At least one name is always required."
            values={companionNames}
            onChange={setCompanionNames}
            validate={validateCompanionNames}
            minCount={1}
            minCountReason="The companion needs at least one name"
            duplicateMessage={(candidate) => `"${candidate}" is already one of its names.`}
            invalidMessage="That name is not valid."
            placeholder="Type a name and press Enter…"
            addAriaLabel="Add a name"
            removeAriaLabel={(name) => `Remove "${name}"`}
            pillsTestId="companion-names-pills"
            inputTestId="companion-names-input"
          />

          <PillListField
            label="What it calls you"
            hint="Dropped into greetings and sign-offs. Empty by default — punctuation collapses cleanly with none set."
            values={companionHonorifics}
            onChange={setCompanionHonorifics}
            validate={validateCompanionHonorifics}
            minCount={0}
            duplicateMessage={(candidate) => `"${candidate}" is already one of what it calls you.`}
            invalidMessage="That value is not valid."
            placeholder="sir, Ada, boss…"
            addAriaLabel="Add what it calls you"
            removeAriaLabel={(name) => `Remove "${name}"`}
            pillsTestId="companion-honorifics-pills"
            inputTestId="companion-honorifics-input"
          />

          <Field
            label="Personality"
            hint="Free-form notes on how the companion should behave — its tone, its quirks. Optional; left blank, its prompts read exactly as they do today."
          >
            <TextArea
              label="Personality"
              value={companionPersonality}
              onChange={setCompanionPersonality}
              disabled={!companionEnabled}
              placeholder="Dry, terse, never uses an exclamation point…"
              rows={4}
              gradient
            />
          </Field>

          <Field
            label="About me"
            hint="Free-form notes about you, so the companion has context on who it's talking to. Optional; left blank, its prompts read exactly as they do today."
          >
            <TextArea
              label="About me"
              value={companionAboutUser}
              onChange={setCompanionAboutUser}
              disabled={!companionEnabled}
              placeholder="What you're working on, how you like things explained…"
              rows={4}
              gradient
            />
          </Field>

          <Field
            label="Offer music on a long wait"
            hint="After 20s waiting on an agent, offers something to listen to. Never plays without a yes."
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
 * which is what starts the one-time ~88 MB download (Kokoro-82M, `q8`) if the
 * model isn't provisioned yet (see `getCompanionTtsStatus`'s own doc), then
 * every 1.5 s
 * while it answers `'downloading'`, stopping once it lands on `'ready'` or
 * `'failed'`. `retry` re-checks with `retry: true`, forcing a fresh
 * provisioning attempt after a prior download failure.
 */
function useCompanionTtsStatus(): {
  status: CompanionTtsStatusValue | null;
  retry: () => void;
  /**
   * Settings' "Reload local engine" control (Ad Hoc: recover from a
   * crashed worker without restarting the app) — calls `ttsReload`, which
   * tears down and re-forks `tts-broker.ts`'s worker in main, and refreshes
   * `status` from its real, awaited result rather than assuming success.
   * A no-op while a reload is already in flight (`reloading`), and again if
   * the bridge has no `ttsReload` at all (an older preload, a test harness)
   * — the button is disabled in both cases, this is the defensive backstop.
   */
  reload: () => void;
  /** Whether a reload is in flight — drives the button's disabled/spinner state. */
  reloading: boolean;
} {
  const [status, setStatus] = useState<CompanionTtsStatusValue | null>(null);
  const [reloading, setReloading] = useState(false);
  // A ref alongside the state: `reload()` below must see the CURRENT
  // in-flight status synchronously (state updates are batched, so a second
  // click in the same tick would still read the pre-click `false`), the
  // same reason `tts-broker.ts`'s own `reloadInFlight` guard lives outside
  // any state a caller could race.
  const reloadingRef = useRef(false);

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

  const reload = useCallback(() => {
    if (reloadingRef.current) return;
    const companion = bridge()?.companion;
    if (!companion?.ttsReload) return;
    reloadingRef.current = true;
    setReloading(true);
    void companion
      .ttsReload({})
      .then((result) => {
        // Refresh from the REAL result, whatever it is — a reload that
        // left the engine `'failed'` still updates the status line to say
        // so, rather than the button optimistically claiming success.
        if (result.ok) setStatus(result.value);
      })
      .finally(() => {
        reloadingRef.current = false;
        setReloading(false);
      });
  }, []);

  return { status, retry: useCallback(() => void check(true), [check]), reload, reloading };
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

/**
 * Ad Hoc "the local voice engine crashed" — Settings' "Reload local
 * engine" control, distinct from `RetryButton` above: Retry only asks the
 * *existing* worker again (useless against a crashed one or a genuinely
 * missing native module — see `TTS_FAILURE_SENTENCES`'s own gating), while
 * this tears the worker down and forks a fresh process, the only thing that
 * actually clears a sticky failure. Offered beside the status line in every
 * state that has one (not the initial "checking" render, before there is
 * anything to reload) — including `'ready'`, since a user may want a fresh
 * worker after changing the voice, not only when something is broken.
 */
function ReloadLocalEngineButton({ onClick, reloading }: { onClick: () => void; reloading: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={reloading}
      title="Tear down and restart the local voice engine's worker process"
      className="inline-flex w-fit items-center gap-1 h-6 rounded-md border border-border px-2 text-xs transition-colors hover:bg-accent disabled:opacity-50"
      data-testid="companion-voice-reload"
    >
      <LuRefreshCw className={`h-3 w-3 ${reloading ? 'animate-spin' : ''}`} />
      {reloading ? 'Reloading…' : 'Reload local engine'}
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
 *
 * `onReload`/`reloading` are Ad Hoc "the local voice engine crashed"'s own
 * addition — see `ReloadLocalEngineButton`'s doc for why it is offered
 * everywhere `onRetry` is not: it recovers from exactly the case Retry
 * cannot (a missing-native-module reason, which now also covers a crashed
 * worker) and is useful even on the plain `'ready'` path.
 */
function CompanionVoiceStatus({
  status,
  rendererEngine,
  onRetry,
  onReload,
  reloading,
}: {
  status: CompanionTtsStatusValue | null;
  rendererEngine: 'local' | 'system';
  onRetry: () => void;
  onReload: () => void;
  reloading: boolean;
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
      <div className="flex flex-col items-start gap-1.5" data-testid="companion-voice-status">
        <p className="flex items-center gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <LuDownload className="h-3 w-3 shrink-0" />
          Downloading the local offline voice (about 88 MB, one time only)…
        </p>
        <ReloadLocalEngineButton onClick={onReload} reloading={reloading} />
      </div>
    );
  }

  if (status.voice === 'ready') {
    if (rendererEngine === 'local') {
      return (
        <div className="flex flex-col items-start gap-1.5" data-testid="companion-voice-status">
          <p className="flex items-center gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <LuCircleCheck className="h-3 w-3 shrink-0 text-emerald-500" />
            Speaking with the local offline voice — no network, no system voice.
          </p>
          <ReloadLocalEngineButton onClick={onReload} reloading={reloading} />
        </div>
      );
    }
    return (
      <div className="flex flex-col items-start gap-1.5" data-testid="companion-voice-status">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          The local voice is ready, but this session already switched to the system voice below.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <RetryButton
            onClick={onRetry}
            label="Use the local voice again"
            testId="companion-voice-retry"
          />
          <ReloadLocalEngineButton onClick={onReload} reloading={reloading} />
        </div>
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
      <div className="flex flex-wrap items-center gap-2">
        {/*
          Only the download failure is retryable through the EXISTING
          worker — a missing native module and a synthesis-throw are sticky
          for that worker process's lifetime (the module doc's own claim);
          offering Retry there would promise a fix it cannot deliver. Reload
          is different: it replaces the worker outright, so it is offered
          for every failure reason, `native-module-missing` (which now also
          covers a crashed worker — see tts-broker.ts's own doc) included.
        */}
        {status.reason === 'download-failed' ? (
          <RetryButton onClick={onRetry} label="Retry download" testId="companion-voice-retry" />
        ) : null}
        <ReloadLocalEngineButton onClick={onReload} reloading={reloading} />
      </div>
    </div>
  );
}

/** Matches `TextField`'s own styling constant (`field.tsx:87`) — not exported, so restated here rather than editing that file for one more caller. */
const PILL_INPUT_CLASSNAME =
  'w-full rounded-md border border-input bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring disabled:opacity-50';

/**
 * A closable-pill list of freeform values, shared by "What you call it"
 * (`companionNames`, Phase 80 Theme D) and "What it calls you"
 * (`companionHonorifics`, Ad Hoc — extracted from that first field's own
 * implementation once a second caller needed the identical pattern).
 *
 * A raw `<input>` sharing `TextField`'s styling constant rather than
 * `TextField` itself — Enter-to-commit and Backspace-to-delete-last need
 * `onKeyDown`, which `TextField` doesn't take, and threading a new prop
 * through a shared primitive for these two callers would be worse than the
 * few extra lines here (phase doc, Decision 7).
 *
 * No tag/token input exists in `@bilo-io/ui` (confirmed against its
 * `dist/index.d.ts`), so this is composed from primitives that already
 * exist: the input's own styling, and `IconButton` for each pill's remove
 * control — `LuX` from `react-icons/lu`, never `lucide-react`.
 *
 * `minCount` is the one behavioural difference between the two callers:
 * `companionNames` blocks removing its last entry (a companion needs at
 * least one name to answer to); `companionHonorifics` has no such floor —
 * zero is its own default, so removing every pill is a normal outcome, not
 * one to guard against.
 */
function PillListField({
  label,
  hint,
  values,
  onChange,
  validate,
  minCount,
  minCountReason,
  duplicateMessage,
  invalidMessage,
  placeholder,
  addAriaLabel,
  removeAriaLabel,
  pillsTestId,
  inputTestId,
}: {
  label: string;
  hint: string;
  values: string[];
  onChange: (values: string[]) => void;
  /** `CompanionNamesSchema.safeParse`/`CompanionHonorificsSchema.safeParse`, wrapped to hide zod's result shape from this generic component. */
  validate: (candidates: string[]) => string[] | null;
  minCount: number;
  /** Shown as the last pill's disabled-remove reason. Required once `minCount > 0`. */
  minCountReason?: string;
  duplicateMessage: (candidate: string) => string;
  invalidMessage: string;
  placeholder: string;
  addAriaLabel: string;
  removeAriaLabel: (value: string) => string;
  pillsTestId: string;
  inputTestId: string;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const commitDraft = useCallback(() => {
    const candidate = draft.trim();
    if (candidate === '') return;
    if (values.some((value) => value.toLowerCase() === candidate.toLowerCase())) {
      setError(duplicateMessage(candidate));
      return;
    }
    const next = validate([...values, candidate]);
    if (next === null) {
      setError(invalidMessage);
      return;
    }
    onChange(next);
    setDraft('');
    setError(null);
  }, [draft, values, onChange, validate, duplicateMessage, invalidMessage]);

  const removeValue = useCallback(
    (value: string) => {
      if (values.length <= minCount) return; // Decision 6: block, never silently backfill a default.
      onChange(values.filter((existing) => existing !== value));
      setError(null);
    },
    [values, onChange, minCount],
  );

  return (
    <Field label={label} hint={hint}>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5" data-testid={pillsTestId}>
          {values.map((value) => (
            <span
              key={value}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pl-2.5 pr-1 text-xs text-foreground"
            >
              {value}
              <IconButton
                icon={LuX}
                label={removeAriaLabel(value)}
                size="sm"
                onClick={() => removeValue(value)}
                disabled={values.length <= minCount}
                disabledReason={values.length <= minCount ? minCountReason : undefined}
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
            } else if (event.key === 'Backspace' && draft === '' && values.length > minCount) {
              removeValue(values[values.length - 1] as string);
            }
          }}
          aria-label={addAriaLabel}
          placeholder={placeholder}
          className={PILL_INPUT_CLASSNAME}
          data-testid={inputTestId}
        />
        {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
      </div>
    </Field>
  );
}

function validateCompanionNames(candidates: string[]): string[] | null {
  const result = CompanionNamesSchema.safeParse(candidates);
  return result.success ? result.data : null;
}

function validateCompanionHonorifics(candidates: string[]): string[] | null {
  const result = CompanionHonorificsSchema.safeParse(candidates);
  return result.success ? result.data : null;
}

/**
 * Structurally what `mstudio:companion:stt-status` answers with, minus
 * `configured`/`encryptionAvailable`/`implemented` (`SttCredentialFields`
 * already tracks those on their own) — see `sherpa-local.ts`'s
 * `LocalSttStatusValue` for the source of truth. Declared here rather than
 * imported for the same package-boundary reason `CompanionTtsStatusValue`
 * above is: `app` may not import `desktop`.
 */
type LocalSttStatusValue = {
  state: 'idle' | 'downloading' | 'ready' | 'failed';
  reason: 'native-module-missing' | 'download-failed' | 'recognition-error' | null;
  message: string | null;
};

/** `reason` → the sentence explaining it — `TTS_FAILURE_SENTENCES`'s own shape, for the STT side. */
const STT_FAILURE_SENTENCES: Record<NonNullable<LocalSttStatusValue['reason']>, string> = {
  'native-module-missing': "The offline speech engine isn't available on this machine",
  'download-failed': 'Could not download the offline speech model',
  'recognition-error': 'The offline speech engine failed to transcribe',
};

/**
 * The one-time download's own visible state (Ad Hoc: the microphone must
 * work with no API key — "any one-time model download must be surfaced, not
 * silent"). Shaped after `CompanionVoiceStatus` above, which does the same
 * job for the local voice engine; `RetryButton` is shared with it as-is.
 */
function LocalSttStatus({
  status,
  onRetry,
}: {
  status: LocalSttStatusValue | null;
  onRetry: () => void;
}) {
  if (status === null || status.state === 'idle') {
    return (
      <p className="text-[11px] leading-relaxed text-muted-foreground" data-testid="companion-stt-local-status">
        Checking the offline speech model…
      </p>
    );
  }

  if (status.state === 'downloading') {
    return (
      <p
        className="flex items-center gap-1.5 text-[11px] leading-relaxed text-muted-foreground"
        data-testid="companion-stt-local-status"
      >
        <LuDownload className="h-3 w-3 shrink-0" />
        Downloading the offline speech model (about 100 MB, one time only)…
      </p>
    );
  }

  if (status.state === 'ready') {
    return (
      <p
        className="flex items-center gap-1.5 text-[11px] leading-relaxed text-muted-foreground"
        data-testid="companion-stt-local-status"
      >
        <LuCircleCheck className="h-3 w-3 shrink-0 text-emerald-500" />
        Ready — the microphone transcribes entirely on this machine.
      </p>
    );
  }

  // status.state === 'failed'
  const sentence = STT_FAILURE_SENTENCES[status.reason ?? 'native-module-missing'];
  return (
    <div className="flex flex-col items-start gap-1.5" data-testid="companion-stt-local-status">
      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <LuTriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
        <span>
          {sentence}
          {status.message ? ` (${status.message})` : ''}. Add an OpenAI Whisper key above instead.
        </span>
      </p>
      {/* Only a download failure is retryable — a missing native module is sticky for the process's lifetime. */}
      {status.reason === 'download-failed' ? (
        <RetryButton onClick={onRetry} label="Retry download" testId="companion-stt-local-retry" />
      ) : null}
    </div>
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
  // `STT_PROVIDER_IDS[0]` is `whisper-local` — the key-free default is also
  // the picker's own default selection, with no extra state needed to make
  // it "the obvious one" (requirement: Settings makes the local provider the
  // obvious default).
  const [provider, setProvider] = useState<SttProviderId>(STT_PROVIDER_IDS[0]);
  const [key, setKey] = useState('');
  const [configured, setConfigured] = useState<SttProviderId[]>([]);
  const [encryptionAvailable, setEncryptionAvailable] = useState(true);
  const [localModel, setLocalModel] = useState<LocalSttStatusValue | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (retry = false) => {
    const companion = bridge()?.companion;
    if (!companion?.sttStatus) return;
    const next = await companion.sttStatus({ retry });
    setConfigured(next.configured);
    setEncryptionAvailable(next.encryptionAvailable);
    setLocalModel(next.localModel);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /*
    Polls while the one-time local model download is in flight — the same
    shape `useCompanionTtsStatus` uses for the local voice, so the two
    "downloading a bundled model" states in this file read identically.
    Requirement: a one-time model download must be surfaced, not silent.
  */
  useEffect(() => {
    if (localModel?.state !== 'downloading') return undefined;
    const timer = setInterval(() => void refresh(), 1_500);
    return () => clearInterval(timer);
  }, [localModel?.state, refresh]);

  const retryLocalModel = useCallback(() => void refresh(true), [refresh]);

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
  // The whole point of shipping it: this provider is usable with **zero**
  // credentials, so neither the key field nor the "save a key first" gate on
  // Test applies to it.
  const keyless = STT_PROVIDERS_WITHOUT_KEY.includes(provider);
  const canTest = keyless || stored;

  return (
    <>
      <Field
        label="Provider"
        hint="Which engine transcribes you. Offline needs no key; OpenAI Whisper is an opt-in cloud alternative — audio leaves this machine only while the mic button is held."
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

      {keyless ? (
        <Field
          label="Offline speech model"
          hint="Downloaded once into this app's own data folder. Runs on this machine — nothing you say leaves it."
        >
          <div className="flex flex-col gap-2">
            <LocalSttStatus status={localModel} onRetry={retryLocalModel} />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void test()}
                disabled={disabled || busy}
                title="Send one second of silence and report the round-trip"
                className="h-6 rounded-md border border-border px-2 text-xs transition-colors hover:bg-accent disabled:opacity-50"
                data-testid="companion-stt-test"
              >
                Test
              </button>
              <span className="text-[11px] text-muted-foreground">No API key needed.</span>
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
          </div>
        </Field>
      ) : (
        <Field
          label="API key"
          hint="Held in the OS keychain, never in the app's own storage. Leave it empty and press Save to forget a stored key."
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
                disabled={disabled || busy || !canTest}
                title={canTest ? 'Send one second of silence and report the round-trip' : 'Save a key first'}
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
      )}
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
