import { bridge, type FrameDialogs } from '@midnite/studio-frame';

import { useTerminalStore } from './terminal-store';

/**
 * "Recover Detached Sessions" (`terminal.recoverDetached`): have main re-adopt every live session in any
 * broker and rebuild the rows it lost, then re-read the list so they appear. Reusable — a later phase's
 * status-bar widget calls this same entry point. Resolves with main's envelope, or `null` with no bridge.
 */
export async function recoverDetachedSessions(dialogs?: Pick<FrameDialogs, 'notify'>) {
  const api = bridge();
  if (!api) return null;
  const result = await api.terminal.recoverDetached();
  if (!result.ok) {
    dialogs?.notify({ title: 'Could not recover sessions', body: result.message });
    return result;
  }
  // `refresh`, not `hydrate`: hydrate runs once per launch, and this is a re-read on demand.
  await useTerminalStore.getState().refresh();
  const n = result.recovered.length;
  dialogs?.notify({
    title: n === 0 ? 'No detached sessions' : `Recovered ${n} detached session${n === 1 ? '' : 's'}`,
    body:
      result.previousBuild > 0
        ? `${result.previousBuild} of ${result.live} running session${result.live === 1 ? '' : 's'} belong to a previous build — end them from the session list.`
        : `${result.live} session${result.live === 1 ? '' : 's'} running.`,
  });
  return result;
}
