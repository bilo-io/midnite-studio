import {
  COMPANION_PHRASES,
  STT_PROVIDER_IDS,
  STT_PROVIDER_LABELS,
  interpolatePhrase,
  pickPhrase,
  type SttProviderId,
} from '@midnite/studio-shared';
import { Accordion } from '@bilo-io/ui';
import { useCallback, useEffect, useState } from 'react';
import { LuBot, LuMic, LuSmile, LuVolume2 } from 'react-icons/lu';

import { setCompanionVolume as applyCompanionVolume } from '../../companion/audio/context';
import { companionTtsSpeaker } from '../../companion/speaker';
import { refreshMicAvailability } from '../../companion/voice-ports';
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
  const companionVoice = useUiStore((s) => s.companionVoice);
  const setCompanionVoice = useUiStore((s) => s.setCompanionVoice);
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

  const sayHello = useCallback(() => {
    const greeting = pickPhrase(COMPANION_PHRASES.greetings);
    void companionTtsSpeaker.speak(interpolatePhrase(greeting, companionHonorific));
  }, [companionHonorific]);

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

      <Accordion title="Voice" icon={<LuVolume2 className="h-4 w-4" />}>
        <div className="flex flex-col gap-4 p-3">
          <Field
            label="Speaking voice"
            hint="One of the voices your operating system already ships — no download, no network. Leave it on the system default and the app uses whichever voice your OS prefers for its own language."
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
                disabled={!companionEnabled || voices.length === 0}
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
