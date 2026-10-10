/**
 * Vitest/jsdom: conversation mode. No browser capability needed — the
 * segmenter is pure, and the session runs against an injected capture and
 * transcriber, so frames are plain arrays and time is frame counts.
 */
import { ok, failure } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCompanionStore } from '../../store/companion-store';
import { useUiStore } from '../../store/ui-store';
import {
  __setConversationDepsForTest,
  conversationArmed,
  conversationOwner,
  createUtteranceSegmenter,
  startConversation,
  stopConversation,
  subscribeConversation,
  type ConversationOwner,
} from './conversation';

const { reportVoiceError, describeMicFailure } = vi.hoisted(() => ({
  reportVoiceError: vi.fn(),
  describeMicFailure: vi.fn(async () => 'I could not use the microphone — permission was refused.'),
}));
vi.mock('./voice-ports', () => ({ reportVoiceError, describeMicFailure }));

/** 100 ms frames at 16 kHz keep the arithmetic readable. */
const RATE = 16_000;
const FRAME = 1600;
const speech = (amplitude = 0.2): Float32Array => {
  const frame = new Float32Array(FRAME);
  for (let index = 0; index < FRAME; index += 1) frame[index] = amplitude * Math.sin(index / 3);
  return frame;
};
const silence = (level = 0.001): Float32Array => {
  const frame = new Float32Array(FRAME);
  for (let index = 0; index < FRAME; index += 1) frame[index] = index % 2 === 0 ? level : -level;
  return frame;
};

describe('createUtteranceSegmenter', () => {
  const feed = (frames: Float32Array[], gated: (index: number) => boolean = () => false) => {
    const segmenter = createUtteranceSegmenter({ sampleRate: RATE });
    const onsets: number[] = [];
    const utterances: Float32Array[] = [];
    frames.forEach((frame, index) => {
      const out = segmenter.push(frame, gated(index));
      if (out.onset) onsets.push(index);
      if (out.utterance) utterances.push(out.utterance);
    });
    return { onsets, utterances };
  };
  const repeat = (count: number, make: () => Float32Array) => Array.from({ length: count }, make);

  it('hears nothing in a quiet room', () => {
    expect(feed(repeat(50, silence))).toEqual({ onsets: [], utterances: [] });
  });

  it('cuts a phrase at the one-second pause after it, with its pre-roll', () => {
    const { onsets, utterances } = feed([...repeat(5, silence), ...repeat(10, speech), ...repeat(12, silence)]);
    // Onset after 150 ms of sustained speech: the second speech frame.
    expect(onsets).toEqual([6]);
    expect(utterances).toHaveLength(1);
    // 300 ms pre-roll (3 frames, the onset frames among them) + the rest of the speech + 1 s of silence.
    expect(utterances[0]!.length).toBe((3 + 8 + 10) * FRAME);
  });

  it('ignores a click too short to be speech', () => {
    expect(feed([...repeat(5, silence), speech(), ...repeat(15, silence)])).toEqual({ onsets: [], utterances: [] });
  });

  it('drops a phrase with too little speech to send', () => {
    const { onsets, utterances } = feed([...repeat(5, silence), ...repeat(2, speech), ...repeat(15, silence)]);
    expect(onsets).toHaveLength(1);
    expect(utterances).toHaveLength(0);
  });

  it('learns a noisy room rather than hearing it as someone talking', () => {
    const fan = () => silence(0.03);
    const { onsets, utterances } = feed([...repeat(40, fan), ...repeat(10, () => speech(0.3)), ...repeat(12, fan)]);
    expect(onsets).toEqual([41]);
    expect(utterances).toHaveLength(1);
  });

  it('drops everything heard while the companion is speaking', () => {
    const frames = [...repeat(5, silence), ...repeat(10, speech), ...repeat(12, silence)];
    expect(feed(frames, (index) => index >= 5 && index < 15)).toEqual({ onsets: [], utterances: [] });
  });

  it('cuts a monologue at the cap and carries on listening', () => {
    const segmenter = createUtteranceSegmenter({ sampleRate: RATE, maxUtteranceMs: 2000 });
    const cuts: number[] = [];
    for (let index = 0; index < 5; index += 1) segmenter.push(silence());
    for (let index = 0; index < 50; index += 1) {
      if (segmenter.push(speech()).utterance) cuts.push(index);
    }
    expect(cuts.length).toBeGreaterThanOrEqual(2);
    expect(segmenter.inSpeech()).toBe(true);
  });
});

describe('the conversation session', () => {
  let onFrame: ((frame: Float32Array) => void) | null;
  let close: ReturnType<typeof vi.fn>;
  let transcribe: ReturnType<typeof vi.fn>;
  let speaking: boolean;

  const owner = (): ConversationOwner & { deliver: ReturnType<typeof vi.fn> } => ({ deliver: vi.fn() });
  /** One spoken phrase: speech, then the pause that ends it. */
  const say = async (): Promise<void> => {
    for (let index = 0; index < 5; index += 1) onFrame?.(silence());
    for (let index = 0; index < 8; index += 1) onFrame?.(speech());
    for (let index = 0; index < 11; index += 1) onFrame?.(silence());
    await vi.waitFor(() => expect(transcribe).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  beforeEach(() => {
    onFrame = null;
    close = vi.fn();
    speaking = false;
    transcribe = vi.fn(async () => ok({ text: 'open the pull request' }));
    __setConversationDepsForTest({
      openCapture: async (callback) => {
        onFrame = callback;
        return { stream: {} as MediaStream, sampleRate: RATE, close };
      },
      transcribe: transcribe as never,
      isSpeaking: () => speaking,
    });
    reportVoiceError.mockClear();
    useUiStore.setState({ voiceConversation: true, voiceConversationTrigger: 'always', companionNames: ['Companion'] });
    useCompanionStore.setState({ state: 'idle' });
  });

  afterEach(() => {
    __setConversationDepsForTest(null);
    vi.useRealTimers();
  });

  it('sends every phrase to the composer that is listening', async () => {
    const chat = owner();
    await startConversation(chat);
    expect(conversationOwner()).toBe(chat);

    await say();
    expect(transcribe.mock.calls[0]![0]).toBeInstanceOf(Blob);
    expect((transcribe.mock.calls[0]![0] as Blob).type).toBe('audio/wav');
    expect(chat.deliver).toHaveBeenCalledExactlyOnceWith('open the pull request');
  });

  it('keeps listening for the next phrase without another press', async () => {
    const chat = owner();
    await startConversation(chat);
    await say();
    transcribe.mockResolvedValueOnce(ok({ text: 'and merge it' }));
    await say();
    expect(chat.deliver.mock.calls).toEqual([['open the pull request'], ['and merge it']]);
  });

  it('treats an empty transcript as a pause, not an error', async () => {
    transcribe.mockResolvedValue(ok({ text: '' }));
    const chat = owner();
    await startConversation(chat);
    await say();
    expect(chat.deliver).not.toHaveBeenCalled();
    expect(reportVoiceError).not.toHaveBeenCalled();
  });

  it('reports a failing engine once, not after every phrase', async () => {
    transcribe.mockResolvedValue(failure('Transcription took longer than 15 seconds.'));
    const chat = owner();
    await startConversation(chat);
    await say();
    await say();
    expect(reportVoiceError).toHaveBeenCalledExactlyOnceWith('Transcription took longer than 15 seconds.');
  });

  it('never transcribes what it heard while the companion was speaking', async () => {
    speaking = true;
    const chat = owner();
    await startConversation(chat);
    for (let index = 0; index < 30; index += 1) onFrame?.(index % 3 === 0 ? silence() : speech());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('moves to the composer that starts listening last, on the same stream', async () => {
    const first = owner();
    const second = owner();
    await startConversation(first);
    await startConversation(second);
    expect(conversationOwner()).toBe(second);
    // The first composer unmounting must not close a session it no longer holds.
    stopConversation(first);
    expect(conversationOwner()).toBe(second);
    await say();
    expect(second.deliver).toHaveBeenCalledOnce();
    expect(first.deliver).not.toHaveBeenCalled();
  });

  it('closes the mic when the shared setting goes back to manual', async () => {
    const listener = vi.fn();
    subscribeConversation(listener);
    await startConversation(owner());
    useUiStore.setState({ voiceConversation: false });
    expect(conversationOwner()).toBeNull();
    expect(close).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalled();
  });

  it('reports a refused microphone the way push-to-talk does, and ends the session', async () => {
    __setConversationDepsForTest({
      openCapture: async () => {
        throw new DOMException('denied', 'NotAllowedError');
      },
      transcribe: transcribe as never,
      isSpeaking: () => false,
    });
    await startConversation(owner());
    expect(conversationOwner()).toBeNull();
    expect(reportVoiceError).toHaveBeenCalledExactlyOnceWith(
      'I could not use the microphone — permission was refused.',
    );
  });

  describe('with the wake-word trigger', () => {
    beforeEach(() => {
      useUiStore.setState({ voiceConversationTrigger: 'wake', companionNames: ['Companion', 'Jarvis'] });
    });

    it('sends only what follows the name', async () => {
      transcribe.mockResolvedValue(ok({ text: 'Hey Jarvis, open the pull request.' }));
      const chat = owner();
      await startConversation(chat);
      await say();
      expect(chat.deliver).toHaveBeenCalledExactlyOnceWith('open the pull request.');
    });

    it('drops a phrase that was not addressed to it', async () => {
      transcribe.mockResolvedValue(ok({ text: 'I told the companion yesterday' }));
      const chat = owner();
      await startConversation(chat);
      await say();
      expect(chat.deliver).not.toHaveBeenCalled();
      // Background talk never lights the companion up as listening.
      expect(useCompanionStore.getState().state).toBe('idle');
    });

    it('arms on the name alone and sends the next phrase whole', async () => {
      const chat = owner();
      await startConversation(chat);
      transcribe.mockResolvedValueOnce(ok({ text: 'Companion.' }));
      await say();
      expect(conversationArmed()).toBe(true);
      expect(useCompanionStore.getState().state).toBe('listening');
      expect(chat.deliver).not.toHaveBeenCalled();

      transcribe.mockResolvedValueOnce(ok({ text: 'open the pull request' }));
      await say();
      expect(chat.deliver).toHaveBeenCalledExactlyOnceWith('open the pull request');
      expect(conversationArmed()).toBe(false);
    });

    it('stops waiting for the command once the follow-up window passes', async () => {
      __setConversationDepsForTest({
        openCapture: async (callback) => {
          onFrame = callback;
          return { stream: {} as MediaStream, sampleRate: RATE, close };
        },
        transcribe: transcribe as never,
        isSpeaking: () => false,
        wakeFollowUpMs: 250,
      });
      const chat = owner();
      await startConversation(chat);
      transcribe.mockResolvedValueOnce(ok({ text: 'Companion' }));
      await say();
      expect(conversationArmed()).toBe(true);

      await vi.waitFor(() => expect(conversationArmed()).toBe(false));
      expect(useCompanionStore.getState().state).toBe('idle');

      transcribe.mockResolvedValueOnce(ok({ text: 'open the pull request' }));
      await say();
      expect(chat.deliver).not.toHaveBeenCalled();
    });
  });

  describe('during a voice audition (Phase 109 Theme F)', () => {
    let bargeable: boolean;
    let expectingReply: boolean;
    let bargeIn: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      bargeable = false;
      expectingReply = false;
      bargeIn = vi.fn(() => {
        // The barge-in cancels the sample, so the companion stops speaking.
        speaking = false;
      });
      __setConversationDepsForTest({
        openCapture: async (callback) => {
          onFrame = callback;
          return { stream: {} as MediaStream, sampleRate: RATE, close };
        },
        transcribe: transcribe as never,
        isSpeaking: () => speaking,
        bargeable: () => bargeable,
        bargeIn,
        expectingReply: () => expectingReply,
      });
    });

    it('talking over a local sample cuts it off, and the reply is transcribed and sent', async () => {
      speaking = true;
      bargeable = true;
      transcribe.mockResolvedValue(ok({ text: 'number two' }));
      const chat = owner();
      await startConversation(chat);
      await say();
      expect(bargeIn).toHaveBeenCalledTimes(1);
      expect(chat.deliver).toHaveBeenCalledExactlyOnceWith('number two');
    });

    it('stays half-duplex over a system-voice sample: no barge-in, nothing transcribed', async () => {
      speaking = true;
      bargeable = false;
      const chat = owner();
      await startConversation(chat);
      for (let index = 0; index < 30; index += 1) onFrame?.(index % 3 === 0 ? silence() : speech());
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(bargeIn).not.toHaveBeenCalled();
      expect(transcribe).not.toHaveBeenCalled();
    });

    it('under the wake trigger, lets a bare reply through while the audition waits for one', async () => {
      useUiStore.setState({ voiceConversationTrigger: 'wake', companionNames: ['Companion'] });
      transcribe.mockResolvedValue(ok({ text: 'two' }));
      const chat = owner();
      await startConversation(chat);

      await say();
      expect(chat.deliver).not.toHaveBeenCalled();

      expectingReply = true;
      await say();
      expect(chat.deliver).toHaveBeenCalledExactlyOnceWith('two');
    });
  });
});
