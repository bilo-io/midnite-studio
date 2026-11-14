import { useCallback, useEffect, useState } from 'react';
import {
  LuAccessibility,
  LuCamera,
  LuCircleCheck,
  LuCircleHelp,
  LuCircleX,
  LuExternalLink,
  LuFolderLock,
  LuHardDrive,
  LuMic,
  LuMonitor,
  LuRefreshCw,
  LuScreenShare,
  LuShieldCheck,
  LuWorkflow,
} from 'react-icons/lu';

import { useFrameChrome, bridge } from '@midnite/studio-frame';
import type { MacPermissionId, MacPermissionState } from '@midnite/studio-shared';

import type { IconComponent } from '../../../components/icon-button';
import { SettingsAccordion } from '../settings-section';

type Row = { id: MacPermissionId; state: MacPermissionState; checkedAt: number; paneUrl: string; resettable: boolean };
type Status = { supported: boolean; bundleId: string; rows: Row[] };

const META: Record<MacPermissionId, { label: string; icon: IconComponent; blurb: string }> = {
  screen: { label: 'Screen Recording', icon: LuScreenShare, blurb: 'Capture, screenshots and computer-use agents.' },
  microphone: { label: 'Microphone', icon: LuMic, blurb: 'Voice input and recordings.' },
  camera: { label: 'Camera', icon: LuCamera, blurb: 'Webcam sources in Capture.' },
  accessibility: { label: 'Accessibility', icon: LuAccessibility, blurb: 'Global shortcuts and computer-use agents driving other apps.' },
  fullDisk: {
    label: 'Full Disk Access',
    icon: LuHardDrive,
    blurb:
      'Recommended for terminals. Shells and agents started here inherit it, so macOS stops asking for Documents, Desktop and Downloads one folder at a time. Optional: you choose.',
  },
  automation: { label: 'Automation', icon: LuWorkflow, blurb: 'Asked the first time Studio controls another app. macOS offers no way to read it without asking.' },
  files: { label: 'Files & Folders', icon: LuFolderLock, blurb: 'Asked the first time a protected folder is opened. Not read here, because reading would ask.' },
  notifications: { label: 'Notifications', icon: LuMonitor, blurb: 'Managed in System Settings; Studio cannot read it.' },
};

const STATE_LABEL: Record<MacPermissionState, string> = {
  granted: 'Granted',
  denied: 'Not granted',
  'not-determined': 'Not asked yet',
  restricted: 'Restricted by policy',
  unknown: 'Unknown',
  unchecked: 'Asked on first use',
};

function Pill({ state }: { state: MacPermissionState }) {
  const tone =
    state === 'granted'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
      : state === 'denied' || state === 'restricted'
        ? 'border-red-500/30 bg-red-500/10 text-red-500'
        : 'border-border text-muted-foreground';
  const Icon = state === 'granted' ? LuCircleCheck : state === 'denied' || state === 'restricted' ? LuCircleX : LuCircleHelp;
  return (
    <span
      data-testid={`permission-state-${state}`}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {STATE_LABEL[state]}
    </span>
  );
}

/**
 * Settings ▸ Permissions: each macOS grant as this build sees it, read live and re-read on focus. A grant
 * macOS shows as on but this build reports off belongs to an older build; Reset clears this app's entry
 * so the next use asks again with the current signature.
 */
export function PermissionsPage() {
  const dialogs = useFrameChrome().useDialogs();
  const [status, setStatus] = useState<Status | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);

  const refresh = useCallback(() => {
    void bridge()
      ?.permissions.status()
      .then(setStatus, () => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const openPane = (id: MacPermissionId) => {
    void bridge()
      ?.permissions.openPane({ id })
      .then((r) => setNote(r.ok ? null : r.kind === 'error' ? r.message : 'Could not open System Settings.'));
  };

  const reset = (row: Row) => {
    const api = bridge()?.permissions;
    if (!api || !status) return;
    const label = META[row.id].label;
    dialogs.confirm({
      title: `Reset ${label} for Midnite Studio?`,
      body: 'Removes the macOS entry for this app only. The next time Studio needs it, macOS asks again.',
      confirmLabel: 'Reset',
      danger: true,
      warnings: [
        `Only ${status.bundleId} is affected; no other app's permissions change.`,
        row.id === 'files'
          ? 'Clears Documents, Desktop, Downloads, network and removable volume access for Studio.'
          : `Studio loses ${label} until you grant it again. Shells and agents in its terminals lose it too.`,
        'Relaunch afterwards so the prompt reappears.',
      ],
      onConfirm: () => {
        void api.reset({ id: row.id }).then((r) => {
          if (r.ok) {
            setNote(null);
            setResetDone(true);
            refresh();
          } else {
            setNote(r.kind === 'error' ? r.message : 'Reset failed.');
          }
        });
      },
    });
  };

  if (!status) return <p className="p-3 text-xs text-muted-foreground">Checking permissions…</p>;

  return (
    <div className="flex flex-col gap-4">
      {!status.supported ? (
        <p className="rounded-md border border-border p-3 text-xs text-muted-foreground">
          Permissions are managed by macOS, so this page only does something on a Mac.
        </p>
      ) : null}

      <SettingsAccordion title="macOS permissions" icon={<LuShieldCheck className="h-4 w-4" />} defaultOpen>
        <ul className="divide-y divide-border">
          {status.rows.map((row) => {
            const meta = META[row.id];
            const Icon = meta.icon;
            return (
              <li key={row.id} data-testid={`permission-row-${row.id}`} className="flex flex-col gap-2 p-3">
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">{meta.label}</p>
                    <p className="text-[11px] text-muted-foreground">{meta.blurb}</p>
                  </div>
                  <Pill state={row.state} />
                  {status.supported ? (
                    <button
                      type="button"
                      onClick={() => openPane(row.id)}
                      aria-label={`Open System Settings for ${meta.label}`}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-foreground hover:bg-muted"
                    >
                      <LuExternalLink className="h-3 w-3" aria-hidden />
                      Open System Settings
                    </button>
                  ) : null}
                </div>
                {row.resettable && row.state !== 'unchecked' && status.supported ? (
                  <details className="ml-7 text-[11px] text-muted-foreground">
                    <summary className="cursor-pointer select-none">Shows on in System Settings but off here?</summary>
                    <div className="mt-1.5 space-y-1.5">
                      <p>
                        The grant probably belongs to an older build of Studio. Toggle {meta.label} off and on in System
                        Settings, or reset this app's entry and relaunch so macOS asks again.
                      </p>
                      <button
                        type="button"
                        onClick={() => reset(row)}
                        aria-label={`Reset ${meta.label}`}
                        className="rounded-md border border-red-500/40 px-2 py-1 text-[11px] text-red-500 hover:bg-red-500/10"
                      >
                        Reset {meta.label}
                      </button>
                    </div>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      </SettingsAccordion>

      {resetDone ? (
        <div className="flex items-center gap-3 rounded-md border border-border p-3 text-xs">
          <span className="flex-1 text-foreground">Reset done. Relaunch Studio so macOS asks again on next use.</span>
          <button
            type="button"
            onClick={() => void bridge()?.permissions.relaunch()}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
          >
            <LuRefreshCw className="h-3 w-3" aria-hidden />
            Relaunch
          </button>
        </div>
      ) : null}
      {note ? (
        <p role="alert" className="text-xs text-red-500">
          {note}
        </p>
      ) : null}

      <p className="px-1 text-[11px] text-muted-foreground">
        Shells and agents in Studio's terminals inherit these grants, because Studio is their responsible process. That
        is why computer-use and browser-use agents need Studio itself to hold Accessibility and Screen Recording. This
        page re-checks whenever Studio regains focus.
      </p>
    </div>
  );
}
