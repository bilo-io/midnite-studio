import { create } from 'zustand';

import {
  COMPANION_MCP_TOO_LATE,
  companionSettingSpec,
  type CompanionSettingKey,
} from '@midnite/studio-shared';

import { ConfirmDialog } from '../../components/confirm-dialog';
import { useCompanionStore, type PendingAction } from '../../store/companion-store';
import { useToastStore } from '../../store/toast-store';
import { useUiStore } from '../../store/ui-store';
import { PENDING_ACTION_MEMORY_MS } from './handoff';
import { companionSpeaker } from './runtime';

/**
 * Asking the user about an agent's confirm-tier companion change (Phase 109
 * Theme D, Decision 3). `companion_settings_set` waits on this answer, and so
 * do `companion_profile_delete` and a `companion_profile_save` over an
 * existing name (Theme G), through {@link askToConfirmMcpProfile}.
 *
 * Two ways to ask, one answer:
 *
 * - **The companion is on, in this window:** it asks aloud and shows the
 *   Run/Cancel chip — Phase 81's own `pendingAction`, so "yes", an empty Return
 *   and the Run chip all approve, and "no", "stop" and Cancel all decline. The
 *   panel opens, because the chip lives in it.
 * - **Otherwise** (off, or popped out into its own window, where this
 *   window's chip is not on screen): `confirm-dialog.tsx` asks, with no speech.
 *
 * **Nothing applies after the deadline.** The answer is checked against the
 * wall clock, not only a timer, so a throttled timer in a background window
 * cannot stretch the wait. On the companion path the question stays in the
 * chip for the rest of its sixty seconds, so a late "yes" hears
 * {@link COMPANION_MCP_TOO_LATE} instead of "Nothing's waiting."; the dialog
 * simply closes, with a toast saying why.
 *
 * One question at a time: asking replaces whatever was pending, exactly as a
 * second spoken `confirm`-tier command does, and the replaced one answers
 * `declined`.
 */

export type McpSettingAnswer = 'approved' | 'declined' | 'timeout';

export type McpSettingQuestion = {
  key: CompanionSettingKey;
  previous: unknown;
  next: unknown;
  /** Epoch ms after which no answer counts. */
  deadline: number;
};

const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

const joinWords = (parts: readonly string[]): string =>
  parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

/** A value as the companion would say it — "Nova and Echo", "80 percent", "push to talk". */
export function describeSettingValue(key: CompanionSettingKey, value: unknown): string {
  const spec = companionSettingSpec(key).value;
  if (value === null || value === undefined) return 'the default';
  switch (spec.kind) {
    case 'bool':
      return value === true ? 'on' : 'off';
    case 'enum':
      return spec.spoken[String(value)] ?? String(value);
    case 'number':
      return typeof value === 'number' ? `${Math.round(value * 100)} percent` : String(value);
    case 'list':
      return Array.isArray(value) && value.length > 0 ? joinWords(value.map(String)) : 'nothing';
    case 'text': {
      const text = String(value);
      return text.length > 40 ? `“${text.slice(0, 39)}…”` : `“${text}”`;
    }
  }
}

/** The chip's line (it renders "{label}?") and the dialog's title. */
export function settingQuestionLabel(question: Pick<McpSettingQuestion, 'key' | 'next'>): string {
  const label = companionSettingSpec(question.key).label.toLowerCase();
  return `Let your agent set ${label} to ${describeSettingValue(question.key, question.next)}`;
}

/**
 * One question, however it is asked — what the chip, the voice and the
 * dialog each say. A setting change builds it from its key and values; a
 * profile delete or overwrite (Theme G) from the profile's name.
 */
type McpConfirmPrompt = {
  /** The chip's line (it renders "{label}?") — also what "Never mind …" names when a newer question replaces it. */
  label: string;
  /** What the companion says aloud, ending in how to answer. */
  ask: string;
  /** The dialog's title and body. */
  title: string;
  body: string;
  /** The dialog's toast when the agent stops waiting. */
  timeoutToast: string;
  /** Epoch ms after which no answer counts. */
  deadline: number;
};

function settingPrompt(question: McpSettingQuestion): McpConfirmPrompt {
  const spec = companionSettingSpec(question.key);
  return {
    label: settingQuestionLabel(question),
    ask: `Your agent wants to set my ${spec.label.toLowerCase()} to ${describeSettingValue(question.key, question.next)}. Allow it? Say yes, press Return, or tap Run.`,
    title: `${settingQuestionLabel(question)}?`,
    body: `${spec.label}: ${describeSettingValue(question.key, question.previous)} → ${describeSettingValue(question.key, question.next)}. An agent asked for this over the midnite MCP server; nothing changes unless you allow it.`,
    timeoutToast: `Your agent stopped waiting — ${spec.label.toLowerCase()} is unchanged.`,
    deadline: question.deadline,
  };
}

/** Ask, and resolve once with the answer. */
export function askToConfirmMcpSetting(question: McpSettingQuestion): Promise<McpSettingAnswer> {
  return askToConfirmMcp(settingPrompt(question));
}

/**
 * An agent's profile write that needs a yes (Phase 109 Theme G): deleting a
 * profile, or saving over one that already has the name. Asked the same two
 * ways as a setting, with the same deadline rule.
 */
export type McpProfileQuestion = {
  op: 'delete' | 'overwrite';
  /** The profile's own spelling. */
  name: string;
  deadline: number;
};

/** The chip's line and the dialog's title, less the "?". */
export function profileQuestionLabel(question: Pick<McpProfileQuestion, 'op' | 'name'>): string {
  return question.op === 'delete'
    ? `Let your agent delete the ${question.name} profile`
    : `Let your agent save over the ${question.name} profile`;
}

export function askToConfirmMcpProfile(question: McpProfileQuestion): Promise<McpSettingAnswer> {
  const label = profileQuestionLabel(question);
  const doing =
    question.op === 'delete'
      ? `delete the ${question.name} profile`
      : `save over the ${question.name} profile with how I am now`;
  return askToConfirmMcp({
    label,
    ask: `Your agent wants to ${doing}. Allow it? Say yes, press Return, or tap Run.`,
    title: `${label}?`,
    body:
      question.op === 'delete'
        ? `The ${question.name} profile — its voice, personality and what it calls you — is deleted. The companion keeps sounding the way it does now. An agent asked for this over the midnite MCP server; nothing changes unless you allow it.`
        : `The ${question.name} profile is replaced with the companion's current voice, personality and what it calls you. An agent asked for this over the midnite MCP server; nothing changes unless you allow it.`,
    timeoutToast: `Your agent stopped waiting — the ${question.name} profile is unchanged.`,
    deadline: question.deadline,
  });
}

function askToConfirmMcp(prompt: McpConfirmPrompt): Promise<McpSettingAnswer> {
  const ui = useUiStore.getState();
  return ui.companionEnabled && !ui.companionDetached ? askThroughCompanion(prompt) : askThroughDialog(prompt);
}

// --- the companion's chip -------------------------------------------------------

function speakLine(text: string): void {
  const store = useCompanionStore.getState();
  const turn = store.addTurn({ role: 'companion', text, spoken: false });
  const speaker = companionSpeaker();
  if (speaker.available !== true) return;
  void speaker.speak(text).then(() => useCompanionStore.getState().markSpoken(turn.id));
}

function askThroughCompanion(question: McpConfirmPrompt): Promise<McpSettingAnswer> {
  return new Promise((resolve) => {
    const companion = useCompanionStore;
    let settled = false;
    let unsubscribe: () => void = () => {};
    const settle = (answer: McpSettingAnswer): void => {
      if (settled) return;
      settled = true;
      clearTimeout(deadlineTimer);
      resolve(answer);
    };

    const { label } = question;
    const previous = companion.getState().pendingAction;
    const pending: PendingAction = {
      label,
      at: Date.now(),
      onConfirm: () => {
        if (settled || Date.now() > question.deadline) {
          settle('timeout');
          return COMPANION_MCP_TOO_LATE;
        }
        settle('approved');
        // The change itself is announced where it is applied (`ui-requests.ts`).
        return null;
      },
    };

    companion.getState().setPendingAction(pending);
    // Anything that takes the slot — "no", "stop", Cancel, or another question —
    // is a no. A yes has already settled by the time `resolvePending` clears it.
    unsubscribe = companion.subscribe((state) => {
      if (state.pendingAction === pending) return;
      unsubscribe();
      clearTimeout(forgetTimer);
      settle('declined');
    });

    const deadlineTimer = setTimeout(() => settle('timeout'), Math.max(0, question.deadline - Date.now()));
    // Past the deadline the question stays answerable only as "too late"; at
    // the pending window's own end it goes, like any unanswered confirm.
    const forgetTimer = setTimeout(() => {
      if (companion.getState().pendingAction === pending) companion.getState().setPendingAction(null);
    }, PENDING_ACTION_MEMORY_MS);

    useUiStore.getState().setCompanionPanelOpen(true);
    const { ask } = question;
    // A command's label is a name ("Push"); a question's is a sentence, read mid-sentence here.
    const replaced = previous?.onConfirm !== undefined ? lowerFirst(previous.label) : previous?.label;
    speakLine(replaced !== undefined ? `Never mind ${replaced} — ${ask}` : ask);
  });
}

// --- the dialog ------------------------------------------------------------------

type McpSettingDialogRequest = {
  title: string;
  body: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/** The one open dialog, if any — module-level so a plain function can open it, the way `pendingAction` is. */
export const useMcpSettingConfirmStore = create<{ request: McpSettingDialogRequest | null }>(() => ({
  request: null,
}));

function askThroughDialog(question: McpConfirmPrompt): Promise<McpSettingAnswer> {
  return new Promise((resolve) => {
    const dialogs = useMcpSettingConfirmStore;
    let settled = false;
    let unsubscribe: () => void = () => {};
    let request: McpSettingDialogRequest | null = null;
    const settle = (answer: McpSettingAnswer): void => {
      if (settled) return;
      settled = true;
      clearTimeout(deadlineTimer);
      unsubscribe();
      if (dialogs.getState().request === request) dialogs.setState({ request: null });
      resolve(answer);
    };

    request = {
      title: question.title,
      body: question.body,
      onConfirm: () => settle(Date.now() > question.deadline ? 'timeout' : 'approved'),
      onCancel: () => settle('declined'),
    };

    dialogs.setState({ request });
    unsubscribe = dialogs.subscribe((state) => {
      if (state.request !== request) settle('declined');
    });

    const deadlineTimer = setTimeout(() => {
      settle('timeout');
      useToastStore.getState().addToast({ message: question.timeoutToast, status: 'info' });
    }, Math.max(0, question.deadline - Date.now()));
  });
}

/** Mounted once from `app.tsx`; renders the dialog while an agent's change waits on it. */
export function McpSettingConfirmHost() {
  const request = useMcpSettingConfirmStore((state) => state.request);
  if (!request) return null;
  return (
    <ConfirmDialog
      request={{
        title: request.title,
        body: request.body,
        confirmLabel: 'Allow',
        blastRadius: null,
        onConfirm: request.onConfirm,
      }}
      onCancel={request.onCancel}
    />
  );
}
