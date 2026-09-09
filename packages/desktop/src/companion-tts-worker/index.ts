import { getCompanionTtsStatus, configureCompanionTts, synthesizeSpeech } from '../main/companion/tts';

/**
 * Ad Hoc "TTS synthesis blocks the UI" — the `utilityProcess` entry point
 * `tts-broker.ts` forks, mirroring `script-runner-worker/index.ts` exactly:
 * its own OS process, its own memory space, no Electron APIs, no
 * main-process privileges.
 *
 * **Why this exists at all.** `kokoro-js` runs ONNX inference (via
 * `onnxruntime-node`) in-process and, on this build, synchronously enough to
 * pin the thread that calls `.generate()` for the length of a synthesis —
 * seconds, per the module doc's own measurements. Doing that inside
 * Electron's *main* process (as `tts.ts` did directly before this file
 * existed) blocks main's event loop, and with it every window's input
 * handling: the macOS spinning-beachball cursor, un-clickable buttons, a
 * frozen title bar, for as long as one utterance takes to synthesize. A
 * `utilityProcess` moves the CPU-bound work to a process the window's input
 * loop never touches — main only ever *waits* on a message, which costs it
 * nothing.
 *
 * Deliberately thin, the same way `script-runner-worker/index.ts` is: every
 * actual engine property (lazy, one-time model load; the three sticky/
 * transient failure modes; the WAV encode) lives in `tts.ts` itself,
 * imported and called completely unchanged — this file is only the message
 * plumbing `process.parentPort` needs. That also means this worker process
 * becomes `tts.ts`'s own module-level state's *sole* owner: `main`'s copy of
 * that module (still imported by `tts-broker.ts`'s type-only references) is
 * never called, so this process — not main — is the one that actually holds
 * the loaded Kokoro model and the sticky-failure flags. It is configured
 * with `app.getPath('userData')` the identical way main used to configure
 * itself, over its own `'configure'` message rather than a constructor
 * argument, because forking happens lazily on first use and `tts-broker.ts`
 * has no other channel into a process that does not exist yet.
 *
 * One request in flight at a time, by construction of the *broker*, not
 * this file: `tts-broker.ts` never posts a second `'synthesize'` message
 * before the first has replied, so this worker needs no queue of its own —
 * see that module's doc for why (matching hardware reality: one ONNX
 * session, one `.generate()` call at a time) and for how a queued-but-
 * unstarted job gets dropped without ever reaching this process at all.
 */

interface ConfigureMessage {
  type: 'configure';
  directory: string;
}

interface SynthesizeMessage {
  type: 'synthesize';
  id: string;
  text: string;
  voice?: string;
}

interface StatusMessage {
  type: 'status';
  id: string;
  retry: boolean;
}

type InMessage = ConfigureMessage | SynthesizeMessage | StatusMessage;

process.parentPort.on('message', (event) => {
  const data = event.data as InMessage;

  switch (data.type) {
    case 'configure':
      configureCompanionTts(data.directory);
      return;

    case 'synthesize':
      // `synthesizeSpeech` never throws (see `tts.ts`'s own module doc) —
      // no defensive try/catch backstop needed the way
      // `script-runner-worker`'s does for `runScript`, which is a bare `vm`
      // sandbox running untrusted user script text.
      void synthesizeSpeech(data.text, data.voice).then((result) => {
        process.parentPort.postMessage({ type: 'synthesize-reply', id: data.id, result });
      });
      return;

    case 'status':
      void getCompanionTtsStatus(data.retry).then((value) => {
        process.parentPort.postMessage({ type: 'status-reply', id: data.id, value });
      });
      return;
  }
});
