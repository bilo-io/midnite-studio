import { useEffect, useState } from 'react';
import { PiDownloadSimple, PiDownloadSimpleFill } from 'react-icons/pi';

import type { CliStatusResponse } from '@midnite/studio-shared';

import { EmptyStateButton } from '../../../components/empty-state';
import { MidniteIcon } from '../../../components/icons/midnite-icon';
import { SetupMeta } from '../setup-meta';
import { SetupStatusRow, setupRowStatus } from '../setup-status-row';

/** What the command does from a shell — the three forms `resources/bin/midnite --help` lists. */
const USAGE: readonly { command: string; does: string }[] = [
  { command: 'midnite .', does: 'open the repository you are in' },
  { command: 'midnite open <path>', does: 'open a repository by path' },
  { command: 'midnite clone <url>', does: 'clone a repository and open it' },
];

/**
 * The Midnite CLI page (Phase 98 Theme G), over Phase 33's `cliStatus` /
 * `cliInstall` channels.
 *
 * Unlike every other tool setup offers, this one is not a Homebrew install:
 * main symlinks the script bundled inside the app onto PATH itself, the same
 * call Settings ▸ CLI makes — so *installing* shows no terminal link. When
 * the symlink lands in a directory the login shell's PATH lacks (the
 * `~/.local/bin` fallback, when `/usr/local/bin` is not writable), main hands
 * back the `export PATH=…` line to add, and the page shows it.
 */
export function MidniteCliPage() {
  const cli = typeof window !== 'undefined' ? window.midniteStudio?.cli : undefined;
  const [status, setStatus] = useState<CliStatusResponse | null>(null);
  const [probed, setProbed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cli) return;
    let live = true;
    cli
      .status()
      .then((next) => live && setStatus(next))
      .catch(() => live && setError("Couldn't check for the CLI"))
      .finally(() => live && setProbed(true));
    return () => {
      live = false;
    };
  }, [cli]);

  const install = async (): Promise<void> => {
    if (!cli) return;
    setInstalling(true);
    setError(null);
    try {
      const result = await cli.install({ target: 'auto' });
      if (result.ok) setStatus(result.value);
      else setError(result.kind === 'error' ? result.message : 'Installation failed');
    } catch {
      setError('Installation failed');
    } finally {
      setInstalling(false);
    }
  };

  const rowStatus = setupRowStatus({
    loading: Boolean(cli) && !probed,
    installing,
    // No bridge (a browser build) or a failed probe reads as missing, not as checking forever.
    installed: cli && probed ? (status?.installed ?? false) : cli ? undefined : false,
  });

  const detail = !cli
    ? 'Available in the desktop app.'
    : status?.installed
      ? status.managed
        ? (status.notice ?? undefined)
        : `Installed outside Midnite Studio (${status.path})`
      : rowStatus === 'missing'
        ? 'Not installed'
        : undefined;

  const pathHint = status?.installed && status.onPath === false ? status.pathExportLine : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        <code className="font-mono text-foreground">midnite</code> opens Midnite Studio from
        any shell:
      </p>
      <ul className="flex flex-col gap-1.5 text-xs">
        {USAGE.map((row) => (
          <li key={row.command} className="flex items-baseline gap-2">
            <code className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-foreground">
              {row.command}
            </code>
            <span className="text-muted-foreground">— {row.does}</span>
          </li>
        ))}
      </ul>

      <SetupStatusRow
        label="Midnite CLI"
        status={rowStatus}
        icon={MidniteIcon}
        brandColor="#8B5CF6"
        detail={detail}
        meta={
          status?.installed && status.managed && (status.version ?? status.path) ? (
            status.version ? (
              <SetupMeta kind="version" toolId="midnite" label="Midnite CLI" version={status.version} />
            ) : (
              <SetupMeta kind="path" toolId="midnite" label="Midnite CLI" path={status.path!} />
            )
          ) : undefined
        }
        action={
          <EmptyStateButton
            icon={PiDownloadSimple}
            filledIcon={PiDownloadSimpleFill}
            label="Install"
            onClick={() => void install()}
            disabled={!cli}
          />
        }
      />

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {pathHint ? (
        <div
          data-testid="setup-cli-path-hint"
          className="flex flex-col gap-1.5 rounded-md bg-muted/40 p-3 text-xs"
        >
          <span className="text-muted-foreground">
            Installed where your shell does not look yet. Add this line to your shell profile (
            <code className="font-mono">~/.zshrc</code>), then open a new terminal:
          </span>
          <code className="select-all rounded bg-background px-2 py-1 font-mono text-foreground">
            {pathHint}
          </code>
        </div>
      ) : null}
    </div>
  );
}
