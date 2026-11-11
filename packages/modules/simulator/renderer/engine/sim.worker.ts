import { ENGINE_FACTORIES } from './engines';
import { createSimLoop } from './sim-loop';
import type { SimIn, SimOut } from './types';

// The worker global, typed by hand: this module's tsconfig carries the DOM lib, not WebWorker.
const ctx = self as unknown as {
  postMessage(message: SimOut, transfer?: ArrayBuffer[]): void;
  onmessage: ((event: { data: SimIn }) => void) | null;
};

const loop = createSimLoop({
  engines: ENGINE_FACTORIES,
  post: (message, transfer) => ctx.postMessage(message, transfer),
  now: () => performance.now(),
  every: (fn, ms) => {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  },
});

ctx.onmessage = (event) => loop.handle(event.data);
