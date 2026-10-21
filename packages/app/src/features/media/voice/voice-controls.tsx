import { LuMic, LuMicOff, LuVolume2, LuVolumeX } from 'react-icons/lu';

import { Tooltip } from '../../../components/tooltip';
import type { ComposerMic } from '../../../components/ai-thread';
import type { VoiceThread } from './use-voice-thread';

/** The persisted speech on/off toggle — goes in `AiComposer`'s `trailing` slot. */
export function SpeechToggle({ voice }: { voice: VoiceThread }) {
  return (
    <Tooltip label={voice.speechOn ? 'Speech on — replies are read aloud' : 'Speech off'}>
      <button
        type="button"
        aria-label="Speak replies aloud"
        aria-pressed={voice.speechOn}
        data-testid="media-speech-toggle"
        onClick={() => voice.setSpeechOn(!voice.speechOn)}
        className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-accent ${
          voice.speechOn ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        {voice.speechOn ? <LuVolume2 aria-hidden className="h-3.5 w-3.5" /> : <LuVolumeX aria-hidden className="h-3.5 w-3.5" />}
      </button>
    </Tooltip>
  );
}

/**
 * Speech toggle + hold-to-talk mic for forms that are not chat composers
 * (image, audio). Same mic and look as `AiComposer`'s own.
 */
export function VoiceControls({ voice, mic }: { voice: VoiceThread; mic: ComposerMic }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Tooltip label={mic.available ? (mic.held ? 'Listening — release to dictate' : 'Hold to talk') : mic.reason}>
        <button
          type="button"
          aria-label="Hold to talk"
          aria-disabled={mic.available ? undefined : true}
          onPointerDown={mic.pressStart}
          className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
            mic.available
              ? mic.held
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              : 'cursor-default text-muted-foreground/40'
          }`}
        >
          {mic.available ? <LuMic aria-hidden className="h-3.5 w-3.5" /> : <LuMicOff aria-hidden className="h-3.5 w-3.5" />}
        </button>
      </Tooltip>
      <SpeechToggle voice={voice} />
    </div>
  );
}
