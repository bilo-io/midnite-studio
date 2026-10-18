import { useState } from 'react';

import { bridge } from '@midnite/studio-frame';
import {
  CAPTURE_DESTINATION_LABELS,
  type CaptureDestination,
  type CaptureItem,
  type CaptureStatus,
} from '@midnite/studio-shared';

import { useCaptureHost } from './host';

/** Why the PR-comment destination is not offered yet — the one this slice defers (Phase 113 Theme K). */
export const PR_COMMENT_DEFERRED =
  'Not yet: a pull-request comment cannot carry an image from here — the forge has no upload for it. Copy the screenshot and paste it into the comment on the forge instead.';

type Row = {
  destination: CaptureDestination;
  disabledReason: string | null;
  run: () => Promise<string | null>;
};

/**
 * "Send to…" (Phase 113 Theme K) — the destinations this app reaches, each through the host port. Each
 * row only *prepares* the destination; the user acts there. In the standalone app no destination is
 * reachable, and the list says where they are.
 */
export function SendTo({ item, status }: { item: CaptureItem; status: CaptureStatus }) {
  const host = useCaptureHost();
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const reachable = new Set(status.destinations);

  const rows: Row[] = [
    {
      destination: 'chat',
      disabledReason:
        !reachable.has('chat') || !host.sendToChat ? 'Agent chats are in Midnite Studio.' : null,
      run: async () => {
        const attachment = await bridge()?.capture.attachment({ id: item.id });
        if (!attachment) return 'Capture is not available here.';
        if (!attachment.ok)
          return attachment.kind === 'error' ? attachment.message : 'Could not attach it.';
        host.sendToChat?.(attachment.value);
        return null;
      },
    },
    { destination: 'pr-comment', disabledReason: PR_COMMENT_DEFERRED, run: async () => null },
    {
      destination: 'creator',
      disabledReason:
        !reachable.has('creator') || !host.creator
          ? 'Creator projects are in Midnite Studio.'
          : item.kind !== 'screenshot'
            ? 'Only a screenshot can go to a Creator project.'
            : null,
      run: async () => {
        const repo = host.creator?.repo() ?? null;
        if (!repo) return 'Select a repository first — the capture goes into its Creator ▸ Images.';
        const sent = await bridge()?.capture.sendToCreator({ id: item.id, repoId: repo.id });
        if (!sent) return 'Capture is not available here.';
        if (!sent.ok) return sent.kind === 'error' ? sent.message : 'Could not import it.';
        host.creator?.reveal({ repoId: repo.id, ...sent.value });
        return null;
      },
    },
  ];

  const nothingReachable = rows.every((r) => r.disabledReason !== null);

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
              onClick={() => {
                setNote(null);
                void row
                  .run()
                  .then((error) =>
                    setNote(
                      error
                        ? { tone: 'error', text: error }
                        : {
                            tone: 'ok',
                            text: `Ready in ${CAPTURE_DESTINATION_LABELS[row.destination]} — nothing is sent until you send it there.`,
                          },
                    ),
                  );
              }}
            >
              {CAPTURE_DESTINATION_LABELS[row.destination]}
            </button>
          </li>
        ))}
      </ul>
      {nothingReachable ? (
        <p className="text-[11px] text-muted-foreground">
          Send to works inside Midnite Studio. Here, copy or reveal the file instead.
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
