import { bridge, useFrameChrome } from '@midnite/studio-frame';
import {
  REMEDIATION_PENDING,
  REMEDIATION_UNCONFIRMED,
  type ActionBlastRadius,
  type QuarantineEntry,
  type RemediationAction,
  type RemediationUnavailable,
  type SecurityFinding,
  type VanguardResponseStateResponse,
} from '@midnite/studio-shared';
import { useCallback, useEffect, useState } from 'react';

/**
 * Response actions in the view (Phase 120 Theme H). Every action but Mute and Report issue asks main for its
 * blast radius first — computed from the machine as it is now — and runs only from the confirm that shows it.
 * Main plans again when it acts, so the dialog is a preview, never a licence.
 */

export const ACTION_LABEL: Record<RemediationAction['id'], string> = {
  'pause-session': 'Pause session',
  'kill-process-group': 'Kill process group',
  'bootout-launch-item': 'Unload launch item',
  'quarantine-file': 'Quarantine file',
  'restore-file': 'Restore file',
  'revoke-mcp-server': 'Revoke MCP server',
  'chmod-600': 'Restrict to owner (chmod 600)',
  'report-issue': 'Report issue',
  'open-in-agents': 'Open in Agents',
  mute: 'Mute',
};

/** A failed envelope's message; a conflict never comes back from these channels, but the type allows one. */
const failureText = (result: { ok: false; kind: string; message?: string }, fallback = 'That did not go through.'): string =>
  'message' in result && typeof result.message === 'string' ? result.message : fallback;

const EMPTY_STATE: VanguardResponseStateResponse = { quarantineDir: '', quarantine: [], unavailable: {} };

/** The quarantine's entries and the actions this app cannot run, refetched when the ledger or host changes. */
export function useResponseState(): VanguardResponseStateResponse {
  const [state, setState] = useState<VanguardResponseStateResponse>(EMPTY_STATE);
  useEffect(() => {
    let live = true;
    const refetch = (): void => {
      void bridge()
        ?.vanguard.responseState?.()
        .then((next) => {
          if (live) setState(next);
        })
        .catch(() => undefined);
    };
    refetch();
    const offFindings = bridge()?.vanguard.findings.onChanged(refetch);
    const offHost = bridge()?.vanguard.onChanged(refetch);
    return () => {
      live = false;
      offFindings?.();
      offHost?.();
    };
  }, []);
  return state;
}

/** Why an action cannot run here, or null when it can. Phase 121's pair is known before main answers. */
export function unavailableReason(
  id: RemediationAction['id'],
  unavailable: Readonly<Record<string, RemediationUnavailable>>,
): string | null {
  return unavailable[id]?.reason ?? REMEDIATION_PENDING[id]?.reason ?? null;
}

/** The confirm's warning lines: what stops, what moves, which sessions pause, then anything else. */
export function blastRadiusLines(radius: ActionBlastRadius): string[] {
  return [
    ...radius.dies.map((line) => `Stops: ${line}`),
    ...radius.moves.map((line) => `Moves: ${line}`),
    ...radius.pauses.map((line) => `Pauses: ${line}`),
    ...radius.warnings,
  ];
}

/**
 * `run(findingId, action)`: preview, confirm, act. Resolves to a line for the status row — the error when the
 * preview or the act failed, the outcome's detail on success, null when the confirm was cancelled.
 */
export function useResponseAction(onMessage: (message: { text: string; error: boolean } | null) => void) {
  const dialogs = useFrameChrome().useDialogs();
  const [busy, setBusy] = useState(false);

  const act = useCallback(
    async (findingId: string, action: RemediationAction): Promise<void> => {
      const result = await bridge()?.vanguard.findings.act({ findingId, action });
      if (!result) return;
      if (!result.ok) {
        onMessage({ text: failureText(result), error: true });
        return;
      }
      const value = result.value;
      if (value.unavailable) {
        onMessage({ text: value.unavailable.reason, error: false });
        return;
      }
      if (value.issueUrl) await bridge()?.report.openUrl({ url: value.issueUrl });
      onMessage(value.detail ? { text: value.detail, error: false } : null);
    },
    [onMessage],
  );

  const run = useCallback(
    async (findingId: string, action: RemediationAction): Promise<void> => {
      onMessage(null);
      if (REMEDIATION_UNCONFIRMED.has(action.id)) {
        await act(findingId, action);
        return;
      }
      setBusy(true);
      try {
        const preview = await bridge()?.vanguard.findings.preview({ findingId, action });
        if (!preview) return;
        if (!preview.ok) {
          onMessage({ text: failureText(preview), error: true });
          return;
        }
        const radius = preview.value;
        if (radius.unavailable) {
          onMessage({ text: radius.unavailable.reason, error: false });
          return;
        }
        dialogs.confirm({
          title: radius.title,
          body: radius.summary,
          confirmLabel: radius.confirmLabel,
          danger: true,
          // Measured here, not in commits: null keeps the dialog from reading as "still counting".
          blastRadius: null,
          warnings: blastRadiusLines(radius),
          onConfirm: () => void act(findingId, action),
        });
      } finally {
        setBusy(false);
      }
    },
    [act, dialogs, onMessage],
  );

  return { run, busy };
}

/** A finding's own actions, plus Restore when its file is in quarantine. */
function actionsFor(finding: SecurityFinding, state: VanguardResponseStateResponse): RemediationAction[] {
  const held = state.quarantine.find((entry) => entry.findingId === finding.id);
  return [
    ...finding.remediation,
    ...(held ? [{ id: 'restore-file' as const, findingId: finding.id, path: held.originalPath }] : []),
  ];
}

/** The action buttons. A disabled one carries its reason as its title; {@link UnavailableNotes} spells it out. */
export function FindingActions({
  finding,
  state,
  onMessage,
}: {
  finding: SecurityFinding;
  state: VanguardResponseStateResponse;
  onMessage: (message: { text: string; error: boolean } | null) => void;
}) {
  const { run, busy } = useResponseAction(onMessage);
  return (
    <>
      {actionsFor(finding, state).map((action, index) => {
        const reason = unavailableReason(action.id, state.unavailable);
        return (
          <button
            key={`${action.id}-${index}`}
            type="button"
            disabled={reason !== null || busy}
            title={reason ?? action.description}
            onClick={() => void run(finding.id, action)}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ACTION_LABEL[action.id]}
          </button>
        );
      })}
    </>
  );
}

/** Why each disabled action cannot run here, one line each, under the buttons. */
export function UnavailableNotes({ finding, state }: { finding: SecurityFinding; state: VanguardResponseStateResponse }) {
  const reasons = new Map<string, string>();
  for (const action of actionsFor(finding, state)) {
    const reason = unavailableReason(action.id, state.unavailable);
    if (reason) reasons.set(ACTION_LABEL[action.id], reason);
  }
  if (reasons.size === 0) return null;
  return (
    <ul aria-label="Unavailable actions" className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
      {[...reasons].map(([label, reason]) => (
        <li key={label}>
          {label}: {reason}
        </li>
      ))}
    </ul>
  );
}

function days(ms: number): string {
  const d = Math.max(0, Math.round(ms / 86_400_000));
  return d === 1 ? '1 day' : `${d} days`;
}

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function QuarantineRow({ entry, onMessage }: { entry: QuarantineEntry; onMessage: (m: { text: string; error: boolean } | null) => void }) {
  const { run, busy } = useResponseAction(onMessage);
  return (
    <li className="flex items-start gap-3 rounded-md border border-border p-2">
      <div className="min-w-0 flex-1">
        <p className="break-all font-mono text-[11px]">{entry.originalPath}</p>
        <p className="text-[11px] text-muted-foreground">
          {entry.findingTitle} · {size(entry.size)} · deleted in {days(entry.expiresAt - Date.now())}
        </p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run(entry.findingId, { id: 'restore-file', findingId: entry.findingId, path: entry.originalPath })}
        className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
      >
        Restore
      </button>
    </li>
  );
}

/** The Sensors tab's quarantine: what is held, until when, and a way to put each back. */
export function QuarantineCard() {
  const state = useResponseState();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const open = async (): Promise<void> => {
    const result = await bridge()?.vanguard.openQuarantine();
    setMessage(result && !result.ok ? { text: failureText(result, 'The folder could not be opened.'), error: true } : null);
  };
  return (
    <section aria-label="Quarantine" className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <header className="flex items-center gap-2">
        <h3 className="flex-1 text-sm font-medium">Quarantine</h3>
        <button type="button" onClick={() => void open()} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent">
          Open quarantine folder
        </button>
      </header>
      {state.quarantine.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Nothing is in quarantine.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {state.quarantine.map((entry) => (
            <QuarantineRow key={entry.findingId} entry={entry} onMessage={setMessage} />
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">
        A quarantined file is kept at mode 0000, so nothing can read or run it. Restore re-scans it first and puts it back
        with its mode and extended attributes.
      </p>
      {message ? (
        <p role="status" className={`text-xs ${message.error ? 'text-destructive' : 'text-muted-foreground'}`}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
