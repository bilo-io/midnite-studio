import { useState } from 'react';

import { bridge } from '@midnite/studio-frame';
import {
  CAPTURE_DESTINATION_LABELS,
  capturePrCommentUrl,
  type CaptureDestination,
  type CaptureItem,
  type CaptureStatus,
} from '@midnite/studio-shared';

import { useCaptureHost, type CapturePullRequest } from './host';

/** What the PR-comment destination says once the PR page is open — the user's part comes next. */
export const PR_COMMENT_PASTE_NOTE =
  'The capture is on your clipboard — paste it into the comment.';

type Note = { tone: 'ok' | 'error'; text: string };

type Row = {
  destination: CaptureDestination;
  disabledReason: string | null;
  /** What to say once it ran; null when the row opened something that speaks for itself. */
  run: () => Promise<Note | null>;
};

const failed = (result: { ok: false; kind: string; message?: string }, fallback: string): Note => ({
  tone: 'error',
  text: result.kind === 'error' && result.message ? result.message : fallback,
});

/** Studio's destinations: listed everywhere, disabled with the reason where they are not reachable. */
const STUDIO_ONLY: readonly CaptureDestination[] = ['chat', 'pr-comment', 'creator'];

type PullPicker =
  | { state: 'closed' }
  | { state: 'loading'; repoName: string }
  | { state: 'open'; repoId: string; repoName: string; pulls: CapturePullRequest[] }
  | { state: 'error'; message: string };

/**
 * "Send to…" (Phase 113 Theme K) — the destinations this app reaches. Each row only *prepares* the
 * destination; the user acts there, and nothing is posted, uploaded or sent by Capture itself.
 *
 * - Studio's rows (agent chat, pull-request comment, Creator) go through the host port; outside Studio
 *   they are listed disabled, with where they live.
 * - The standalone app's rows (copy to clipboard, show in Finder, Midnite Studio) appear only where main
 *   offers them (`status.destinations`). "Midnite Studio" opens a `midnite-studio://capture` link main
 *   builds; Studio asks before it imports the capture.
 * - A pull-request comment: pick one of the selected repository's open PRs, the screenshot goes on the
 *   clipboard, and the PR opens in the embedded browser at its comment box for the user to paste into.
 */
export function SendTo({ item, status }: { item: CaptureItem; status: CaptureStatus }) {
  const host = useCaptureHost();
  const [note, setNote] = useState<Note | null>(null);
  const [picker, setPicker] = useState<PullPicker>({ state: 'closed' });
  const reachable = new Set(status.destinations);
  const api = bridge()?.capture;
  const screenshot = item.kind === 'screenshot';

  const ready = (destination: CaptureDestination): Note => ({
    tone: 'ok',
    text: `Ready in ${CAPTURE_DESTINATION_LABELS[destination]} — nothing is sent until you send it there.`,
  });

  const openPicker = async (): Promise<Note | null> => {
    const repo = host.prComment?.repo() ?? null;
    if (!repo || !host.prComment)
      return {
        tone: 'error',
        text: 'Select a repository first — its open pull requests are listed.',
      };
    setPicker({ state: 'loading', repoName: repo.name });
    const listed = await host.prComment.pulls(repo.id);
    if (!listed.ok) {
      setPicker({ state: 'error', message: listed.message });
      return null;
    }
    setPicker({ state: 'open', repoId: repo.id, repoName: repo.name, pulls: listed.pulls });
    return null;
  };

  const commentOn = async (repoId: string, pull: CapturePullRequest): Promise<Note> => {
    if (!api) return { tone: 'error', text: 'Capture is not available here.' };
    const url = capturePrCommentUrl(pull.url);
    if (!url) return { tone: 'error', text: 'That pull request has no web page to open.' };
    // The clipboard first: the page opens only once the image is there to paste.
    const copied = await api.copy({ id: item.id });
    if (!copied.ok) return failed(copied, 'Could not put the capture on the clipboard.');
    setPicker({ state: 'closed' });
    host.prComment?.open({ repoId, url });
    return { tone: 'ok', text: PR_COMMENT_PASTE_NOTE };
  };

  const rows: Row[] = [
    {
      destination: 'chat',
      disabledReason:
        !reachable.has('chat') || !host.sendToChat ? 'Agent chats are in Midnite Studio.' : null,
      run: async () => {
        const attachment = await api?.attachment({ id: item.id });
        if (!attachment) return { tone: 'error', text: 'Capture is not available here.' };
        if (!attachment.ok) return failed(attachment, 'Could not attach it.');
        host.sendToChat?.(attachment.value);
        return ready('chat');
      },
    },
    {
      destination: 'pr-comment',
      disabledReason:
        !reachable.has('pr-comment') || !host.prComment
          ? 'Pull requests are in Midnite Studio.'
          : !screenshot
            ? 'Only a screenshot can be pasted into a comment.'
            : null,
      run: openPicker,
    },
    {
      destination: 'creator',
      disabledReason:
        !reachable.has('creator') || !host.creator
          ? 'Creator projects are in Midnite Studio.'
          : !screenshot
            ? 'Only a screenshot can go to a Creator project.'
            : null,
      run: async () => {
        const repo = host.creator?.repo() ?? null;
        if (!repo)
          return {
            tone: 'error',
            text: 'Select a repository first — the capture goes into its Creator ▸ Images.',
          };
        const sent = await api?.sendToCreator({ id: item.id, repoId: repo.id });
        if (!sent) return { tone: 'error', text: 'Capture is not available here.' };
        if (!sent.ok) return failed(sent, 'Could not import it.');
        host.creator?.reveal({ repoId: repo.id, ...sent.value });
        return ready('creator');
      },
    },
    ...(reachable.has('clipboard')
      ? [
          {
            destination: 'clipboard' as const,
            disabledReason: screenshot ? null : 'Only a screenshot can go on the clipboard.',
            run: async (): Promise<Note> => {
              const copied = await api?.copy({ id: item.id });
              if (!copied) return { tone: 'error', text: 'Capture is not available here.' };
              if (!copied.ok) return failed(copied, 'Could not copy it.');
              return { tone: 'ok', text: 'On the clipboard — paste it anywhere.' };
            },
          },
        ]
      : []),
    ...(reachable.has('finder')
      ? [
          {
            destination: 'finder' as const,
            disabledReason: null,
            run: async (): Promise<Note> => {
              const shown = await api?.reveal({ id: item.id });
              if (!shown) return { tone: 'error', text: 'Capture is not available here.' };
              if (!shown.ok) return failed(shown, 'Could not show it.');
              return { tone: 'ok', text: 'Shown in Finder.' };
            },
          },
        ]
      : []),
    ...(reachable.has('studio')
      ? [
          {
            destination: 'studio' as const,
            disabledReason: null,
            run: async (): Promise<Note> => {
              const opened = await api?.openInStudio({ id: item.id });
              if (!opened) return { tone: 'error', text: 'Capture is not available here.' };
              if (!opened.ok) return failed(opened, 'Midnite Studio did not open.');
              return {
                tone: 'ok',
                text: 'Opening Midnite Studio — it asks before it imports the capture.',
              };
            },
          },
        ]
      : []),
  ];

  const studioOnlyUnreachable = rows
    .filter((r) => STUDIO_ONLY.includes(r.destination))
    .every((r) => r.disabledReason !== null && !reachable.has(r.destination));

  const press = (row: Row) => {
    setNote(null);
    if (row.destination !== 'pr-comment') setPicker({ state: 'closed' });
    void row.run().then(setNote);
  };

  return (
    <div className="flex flex-col gap-1" aria-label="Send to">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Send to
      </span>
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.destination}>
            <button
              type="button"
              className="w-full text-left disabled:opacity-50"
              disabled={row.disabledReason !== null}
              title={row.disabledReason ?? undefined}
              aria-expanded={
                row.destination === 'pr-comment' ? picker.state !== 'closed' : undefined
              }
              onClick={() => press(row)}
            >
              {CAPTURE_DESTINATION_LABELS[row.destination]}
            </button>
            {row.destination === 'pr-comment' && picker.state !== 'closed' ? (
              <PullList
                picker={picker}
                onPick={(repoId, pull) => {
                  setNote(null);
                  void commentOn(repoId, pull).then(setNote);
                }}
                onClose={() => setPicker({ state: 'closed' })}
              />
            ) : null}
          </li>
        ))}
      </ul>
      {studioOnlyUnreachable ? (
        <p className="text-[11px] text-muted-foreground">
          {reachable.has('studio')
            ? 'Chats, pull requests and Creator are in Midnite Studio — open the capture there.'
            : 'Send to works inside Midnite Studio. Here, copy or reveal the file instead.'}
        </p>
      ) : null}
      {note ? (
        <p
          role={note.tone === 'error' ? 'alert' : 'status'}
          className={
            note.tone === 'error'
              ? 'text-[11px] text-destructive'
              : 'text-[11px] text-muted-foreground'
          }
        >
          {note.text}
        </p>
      ) : null}
    </div>
  );
}

function PullList({
  picker,
  onPick,
  onClose,
}: {
  picker: Exclude<PullPicker, { state: 'closed' }>;
  onPick: (repoId: string, pull: CapturePullRequest) => void;
  onClose: () => void;
}) {
  return (
    <div className="ml-2 mt-1 flex flex-col gap-1 border-l border-border pl-2 text-[11px]">
      {picker.state === 'loading' ? (
        <p role="status" className="text-muted-foreground">
          Looking for open pull requests in {picker.repoName}…
        </p>
      ) : picker.state === 'error' ? (
        <p role="alert" className="text-destructive">
          {picker.message}
        </p>
      ) : picker.pulls.length === 0 ? (
        <p className="text-muted-foreground">No open pull requests in {picker.repoName}.</p>
      ) : (
        <ul
          className="flex flex-col gap-0.5"
          aria-label={`Open pull requests in ${picker.repoName}`}
        >
          {picker.pulls.map((pull) => (
            <li key={pull.number}>
              <button
                type="button"
                className="w-full truncate text-left"
                onClick={() => onPick(picker.repoId, pull)}
              >
                #{pull.number} {pull.title}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="self-start text-muted-foreground" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}
