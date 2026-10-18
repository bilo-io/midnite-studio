import type { LibraryFfmpegStatus, LibraryLanStatus } from '@midnite/studio-shared';
import { useEffect, useState } from 'react';
import { LuCopy, LuRefreshCw, LuSearch } from 'react-icons/lu';

import {
  relativeAge,
  SelectField,
  SwitchRow,
  useFrameChrome,
  useToastStore,
} from '@midnite/studio-frame';

import { useLibraryLanMutations, useLibraryLanStatus } from './use-library';

const FFMPEG_SOURCE_LABELS: Record<NonNullable<LibraryFfmpegStatus['source']>, string> = {
  setting: 'the path you set',
  homebrew: 'Homebrew',
  macports: 'MacPorts',
  path: 'your PATH',
};

const BUTTON =
  'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Share on your network (Phase 113 Theme R slice 2) — the Library's LAN server, as the user drives it.
 *
 * Off until the user presses Start. It binds the one private address they pick here (never every interface,
 * never a public one), and every link carries an access token: anyone on that network with the link can
 * watch, nobody without it gets anything. Regenerate cuts every link handed out before. Transcoding is
 * offered only once a system ffmpeg is found — nothing is bundled.
 */
export function SharePanel() {
  const status = useLibraryLanStatus();
  const data = status.data;
  if (!data) return <p className="px-3 py-2 text-[11px] text-muted-foreground">Checking…</p>;
  if (!data.available) {
    return (
      <p className="px-3 py-2 text-[11px] text-muted-foreground">
        Sharing on the network is not available in this build.
      </p>
    );
  }
  return <SharePanelBody status={data} />;
}

function SharePanelBody({ status }: { status: LibraryLanStatus }) {
  const { useDialogs } = useFrameChrome();
  const dialogs = useDialogs();
  const lan = useLibraryLanMutations();
  const { running, interfaces, settings } = status;

  const saved = settings.address;
  const initial =
    interfaces.find((i) => i.address === saved)?.address ?? interfaces[0]?.address ?? '';
  const [address, setAddress] = useState(initial);
  // A network that went away (Wi-Fi off) falls back to whatever is still there.
  useEffect(() => {
    if (!interfaces.some((i) => i.address === address)) setAddress(initial);
  }, [interfaces, address, initial]);

  const regenerate = () =>
    dialogs.confirm({
      title: 'Make a new link?',
      body: 'Every link shared before stops working, and anything playing from one stops. Devices need the new link.',
      confirmLabel: 'Make a new link',
      danger: true,
      onConfirm: () => lan.regenerate.mutate(),
    });

  const copy = (url: string) => {
    void navigator.clipboard
      ?.writeText(url)
      .then(() => useToastStore.getState().addToast({ message: 'Link copied.', status: 'success' }))
      .catch(() => undefined);
  };

  return (
    <div className="space-y-3 px-3 py-2 text-[11px]">
      <p className="text-muted-foreground">
        Watch and listen on a TV, phone or another computer on this network, in its browser. Off
        until you start it; nothing goes beyond the network you pick.
      </p>

      {interfaces.length === 0 && !running ? (
        <p role="status" className="text-muted-foreground">
          No private network found — connect to Wi-Fi or Ethernet first.
        </p>
      ) : running ? (
        <p>
          Sharing on <span className="font-mono">{saved}</span>
        </p>
      ) : (
        <SelectField
          label="Network to share on"
          value={address}
          onChange={setAddress}
          options={interfaces.map((i) => ({ value: i.address, label: `${i.address} (${i.name})` }))}
        />
      )}

      <div className="flex flex-wrap gap-2">
        {running ? (
          <button
            type="button"
            onClick={() => lan.stop.mutate()}
            disabled={lan.stop.isPending}
            className={`${BUTTON} border-border hover:bg-accent`}
          >
            Stop sharing
          </button>
        ) : (
          <button
            type="button"
            onClick={() => lan.start.mutate(address)}
            disabled={address === '' || lan.start.isPending}
            className={`${BUTTON} border-primary/60 bg-primary/10 text-primary hover:bg-primary/20`}
          >
            Start sharing
          </button>
        )}
        {running ? (
          <button
            type="button"
            onClick={regenerate}
            className={`${BUTTON} inline-flex items-center gap-1 border-border hover:bg-accent`}
          >
            <LuRefreshCw aria-hidden className="h-3 w-3" />
            New link
          </button>
        ) : null}
      </div>

      {running && status.url ? (
        <div className="space-y-1">
          <p className="font-medium">Open this on the other device</p>
          <div className="flex items-start gap-1">
            <code
              aria-label="Share link"
              className="min-w-0 flex-1 select-all break-all rounded border border-border bg-muted px-1.5 py-1 font-mono text-[10px]"
            >
              {status.url}
            </code>
            <button
              type="button"
              aria-label="Copy the link"
              title="Copy the link"
              onClick={() => copy(status.url!)}
              className="rounded border border-border p-1 hover:bg-accent"
            >
              <LuCopy aria-hidden className="h-3 w-3" />
            </button>
          </div>
          <p className="text-muted-foreground">
            The key at the end of the link is what lets a device in. Anyone on this network who has
            it can watch — make a new link to shut them all out.
          </p>
        </div>
      ) : null}

      {running ? <ConnectedDevices status={status} /> : null}

      <SwitchRow
        id="library-lan-start-with-app"
        label="Start with the app"
        title="Starts sharing at launch, but only if it was on when you quit"
        on={settings.startWithApp}
        onToggle={(_, next) => lan.setSettings.mutate({ startWithApp: next })}
      />

      <FfmpegSettings status={status} />
    </div>
  );
}

function ConnectedDevices({ status }: { status: LibraryLanStatus }) {
  const now = Date.now();
  return (
    <section aria-label="Connected devices" className="space-y-1">
      <p className="font-medium">
        Connected devices{status.transcodes > 0 ? ` · ${status.transcodes} converting` : ''}
      </p>
      {status.clients.length === 0 ? (
        <p className="text-muted-foreground">None yet.</p>
      ) : (
        <ul className="space-y-0.5">
          {status.clients.map((client) => (
            <li key={client.address} className="flex items-center gap-2">
              <span className="font-mono">{client.address}</span>
              <span className="flex-1" />
              <span className="text-muted-foreground">
                {relativeAge(client.lastRequestAt, now)} · {client.requests} request
                {client.requests === 1 ? '' : 's'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FfmpegSettings({ status }: { status: LibraryLanStatus }) {
  const lan = useLibraryLanMutations();
  const { ffmpeg, settings } = status;

  return (
    <section aria-label="Converting formats" className="space-y-2 border-t border-border pt-2">
      <p className="font-medium">Formats a browser can’t play</p>
      <div className="flex items-start gap-2">
        <p role="status" className="min-w-0 flex-1 text-muted-foreground">
          {ffmpeg.found && ffmpeg.path ? (
            <>
              ffmpeg found at <span className="break-all font-mono">{ffmpeg.path}</span>
              {ffmpeg.source ? ` (${FFMPEG_SOURCE_LABELS[ffmpeg.source]})` : ''}.
            </>
          ) : (
            <>
              ffmpeg not found{ffmpeg.reason ? ` — ${ffmpeg.reason}` : ''}. Install it (
              <code>brew install ffmpeg</code>) to convert other formats; without it they are listed
              as not playable.
            </>
          )}
        </p>
        <button
          type="button"
          aria-label="Look for ffmpeg again"
          title="Look for ffmpeg again"
          onClick={() => lan.detectFfmpeg.mutate()}
          className="rounded border border-border p-1 hover:bg-accent"
        >
          <LuSearch aria-hidden className="h-3 w-3" />
        </button>
      </div>
      {ffmpeg.found ? (
        <SwitchRow
          id="library-lan-transcode"
          label="Convert what browsers can’t play"
          title="Streams other formats as MP4 (H.264 + AAC) through your ffmpeg, as they play"
          on={settings.transcode}
          onToggle={(_, next) => lan.setSettings.mutate({ transcode: next })}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={lan.chooseFfmpeg.isPending}
          onClick={() => lan.chooseFfmpeg.mutate()}
          className={`${BUTTON} border-border hover:bg-accent`}
        >
          Choose ffmpeg…
        </button>
        {settings.ffmpegPath ? (
          <>
            <span
              aria-label="Chosen ffmpeg"
              className="min-w-0 flex-1 break-all font-mono text-muted-foreground"
            >
              {settings.ffmpegPath}
            </span>
            <button
              type="button"
              onClick={() => lan.setSettings.mutate({ ffmpegPath: null })}
              className={`${BUTTON} shrink-0 border-border hover:bg-accent`}
            >
              Use auto-detect
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}
