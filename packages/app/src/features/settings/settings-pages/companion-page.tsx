import { Accordion } from '@bilo-io/ui';
import { useEffect, useState } from 'react';
import { LuBot, LuMic, LuSmile, LuVolume2 } from 'react-icons/lu';

import { useUiStore } from '../../../store/ui-store';
import { Field, TextField } from './controls';

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
 * **Two sections the phase lists are deliberately thinner here than the doc
 * describes, and both are honest about which slice owns them.** The voice
 * *preview* button and the volume slider need Theme F's `speaker.ts` and Theme
 * G's master gain, and the microphone provider/key/Test row needs Theme F's
 * provider seam and its `safeStorage` credential file — none of which exist in
 * this PR. The voice *picker* does ship, because it needs nothing but
 * `window.speechSynthesis` and the `companionVoice` preference that already
 * exists, and because a preference with no control is precisely the thing this
 * page was created to stop being true.
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

  const voices = useSpeechVoices();

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
              {voices.map((voice) => (
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
          </Field>
        </div>
      </Accordion>

      <Accordion title="Microphone" icon={<LuMic className="h-4 w-4" />}>
        <div className="flex flex-col gap-4 p-3">
          {/*
            No control yet, and a paragraph rather than a disabled one. A
            greyed-out provider dropdown with no provider behind it would
            invite a click that cannot do anything; a sentence saying what the
            mic button is waiting for is the same information without the dead
            end. The mic button in the panel carries the identical wording in
            its tooltip.
          */}
          <div className="space-y-1.5 rounded-md border border-border/60 bg-card/50 p-3 text-[11px] text-muted-foreground">
            <p className="font-medium text-foreground">Speech-to-text is not configured</p>
            <p>
              Chromium&apos;s own recogniser does not work in Electron — it routes to a Google
              service this app ships no key for — so speaking to the companion needs a provider,
              with its key held in the OS keychain. Until one is set up the microphone button in
              the companion panel stays disabled and everything else here works as normal: the
              companion still greets, grounds, routes and reads back. Typing is the input.
            </p>
          </div>
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

type VoiceOption = { uri: string; label: string };

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
