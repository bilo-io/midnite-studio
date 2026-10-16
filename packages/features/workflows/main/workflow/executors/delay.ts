import type { NodeExecutor, NodeOutcome } from '../executor-registry';

/**
 * The `delay` node: a bounded sleep, for pacing a workflow against an API that
 * rate-limits or a resource that takes a moment to become readable.
 *
 * Bounded at a minute by the schema, not here — a typo cannot park a run for a
 * day. A cancel lands promptly rather than after the full wait: the timer races
 * a poll of the cancel signal, which is the only thing that keeps a cancelled
 * run from sitting at 59 seconds.
 */
export const delayExecutor: NodeExecutor = (node, context): Promise<NodeOutcome> => {
  if (node.kind !== 'delay') return Promise.resolve({ ok: false, error: 'Not a delay node.' });
  const ms = node.config.ms;

  return new Promise((resolve) => {
    const settle = (outcome: NodeOutcome) => {
      clearTimeout(timer);
      clearInterval(poll);
      resolve(outcome);
    };
    const timer = setTimeout(() => settle({ ok: true, output: { sleptMs: ms } }), ms);
    timer.unref?.();
    const poll = setInterval(() => {
      if (context.signal.cancelled()) settle({ ok: false, error: 'Cancelled.' });
    }, 50);
    poll.unref?.();
  });
};
