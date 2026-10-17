import type { TasksCardHandoff } from '@midnite/studio-feature-tasks/renderer';
import { bridge } from '@midnite/studio-frame';
import { agentRunPrompt, handoffLink, type AgentRunHandoff } from '@midnite/studio-shared';

import { coderStore, useCoderStore } from '../coder-store';
import { dialogStore } from './coder-chrome';

/**
 * Coder's end of the agent-run hand-off (Phase 113 Theme O; `docs/APPS.md`, "Coder slice 5").
 *
 * Coder starts no terminal, so a task card's Play hands its run — `{ issueUrl, skill }`, nothing else —
 * to an app that can start an agent. Today that is Studio: main says so (`handoff.runReceiver`), the
 * link goes out as `midnite://open?app=agents&run=…`, and the launcher routes it to Studio, which checks
 * it again, refuses a repository the user does not have open there, and always asks before it starts
 * anything. Nothing runs from Coder's side.
 *
 * - **Gated.** Play is enabled only while the "Review actions" switch is on (off by default), and
 *   `send` checks the switch again rather than trusting the button.
 * - **No receiver**, or the link could not be opened: the prompt is offered to copy instead, so the
 *   user can paste it into an agent themselves — never a link that lands nowhere.
 *
 * The outcome is a dialog, not a toast: Coder renders no toast stack.
 */

export const HANDOFF_GATE_CLOSED = 'Turn on Review actions to hand a card to an agent';

export type AgentRunSendOutcome = 'gated' | 'sent' | 'copy';

function notice(title: string, body: string): void {
  dialogStore.setState({ request: { title, body, confirmLabel: 'OK', hideCancel: true, onConfirm: () => undefined } });
}

function offerCopy(run: AgentRunHandoff, why: string): void {
  const prompt = agentRunPrompt(run);
  dialogStore.setState({
    request: {
      title: 'Copy the prompt instead?',
      body: `${why} Paste this into an agent in the repository's checkout: ${prompt}`,
      confirmLabel: 'Copy prompt',
      onConfirm: () => {
        void navigator.clipboard?.writeText(prompt).catch(() => undefined);
      },
    },
  });
}

export async function sendAgentRun(run: AgentRunHandoff): Promise<AgentRunSendOutcome> {
  if (!coderStore.getState().writesEnabled) return 'gated';
  const handoff = bridge()?.handoff;
  let receiver: 'studio' | null = null;
  try {
    receiver = (await handoff?.runReceiver?.())?.receiver ?? null;
  } catch {
    receiver = null;
  }
  if (receiver === null || !handoff) {
    offerCopy(run, 'No app here can start an agent yet — Midnite Studio is not running.');
    return 'copy';
  }
  let opened = false;
  try {
    opened = (await handoff.open({ link: handoffLink({ app: 'agents', run }) })).ok;
  } catch {
    opened = false;
  }
  if (!opened) {
    offerCopy(run, 'The task could not be sent to Midnite Studio.');
    return 'copy';
  }
  notice('Sent to Midnite Studio', `Confirm there to start the agent on ${run.issueUrl}. Nothing runs until you do.`);
  return 'sent';
}

export const CODER_CARD_HANDOFF: TasksCardHandoff = {
  useGate: () => {
    const open = useCoderStore((s) => s.writesEnabled);
    return { open, reason: HANDOFF_GATE_CLOSED };
  },
  send: (run) => {
    void sendAgentRun(run);
  },
};
