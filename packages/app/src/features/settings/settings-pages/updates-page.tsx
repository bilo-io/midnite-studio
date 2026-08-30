import { useState, useEffect } from 'react';
import { LuDownload } from 'react-icons/lu';
import { Accordion } from '@bilo-io/ui';
import { Choice, Field } from './controls';
import { useUiStore } from '../../../store/ui-store';
import type { UpdateState } from '@midnite/studio-shared';

export function UpdatesPage() {
  const autoCheck = useUiStore((s) => s.updatesAutoCheck);
  const setAutoCheck = useUiStore((s) => s.setUpdatesAutoCheck);
  const channel = useUiStore((s) => s.updateChannel);
  const setChannel = useUiStore((s) => s.setUpdateChannel);

  const [updateState, setUpdateState] = useState<UpdateState>({
    phase: 'idle',
    version: null,
    percent: null,
    error: null,
  });

  const hasBridge = typeof window !== 'undefined' && Boolean(window.midniteStudio?.update);

  useEffect(() => {
    if (!hasBridge || !window.midniteStudio?.update) return;
    const unsub = window.midniteStudio.update.onState((state) => {
      setUpdateState(state);
    });
    return unsub;
  }, [hasBridge]);

  const handleCheck = () => {
    if (!hasBridge || !window.midniteStudio?.update) return;
    window.midniteStudio.update.check();
  };

  const handleDownload = () => {
    if (!hasBridge || !window.midniteStudio?.update) return;
    window.midniteStudio.update.download();
  };

  const handleRestart = () => {
    if (!hasBridge || !window.midniteStudio?.update) return;
    window.midniteStudio.update.restart();
  };

  const handleChannelChange = (newChannel: 'stable' | 'beta') => {
    setChannel(newChannel);
    if (hasBridge && window.midniteStudio?.update) {
      window.midniteStudio.update.setChannel({ channel: newChannel });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="App Updates" icon={<LuDownload className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <Field label="Automatic Update Checks" hint="Periodically check for app updates in the background.">
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={autoCheck}
                onChange={(e) => setAutoCheck(e.target.checked)}
                className="accent-[hsl(var(--primary))]"
              />
              <span>Check for updates automatically</span>
            </label>
          </Field>

          <Choice
            label="Update Channel"
            hint="Choose between stable releases and preview beta builds."
            value={channel}
            onChange={handleChannelChange}
            options={[
              ['stable', 'Stable'],
              ['beta', 'Beta / Prerelease'],
            ]}
          />

          <Field
            label="Status & Installation"
            hint={
              updateState.phase === 'checking'
                ? 'Checking for updates...'
                : updateState.phase === 'available'
                  ? `Update version ${updateState.version} is available.`
                  : updateState.phase === 'downloading'
                    ? `Downloading update... (${updateState.percent ?? 0}%)`
                    : updateState.phase === 'downloaded'
                      ? `Update version ${updateState.version} downloaded.`
                      : updateState.phase === 'error'
                        ? updateState.error ?? 'Failed to check for updates'
                        : 'Your app is up to date.'
            }
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!hasBridge || updateState.phase === 'checking' || updateState.phase === 'downloading'}
                  onClick={handleCheck}
                  className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  Check for Updates
                </button>

                {updateState.phase === 'available' && !updateState.manualInstall && (
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent/80"
                  >
                    Download Update
                  </button>
                )}

                {updateState.phase === 'downloaded' && !updateState.manualInstall && (
                  <button
                    type="button"
                    onClick={handleRestart}
                    className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                  >
                    Restart to Update
                  </button>
                )}
              </div>

              {updateState.manualInstall && updateState.phase === 'available' && (
                <div className="mt-2 flex flex-col gap-1 rounded bg-muted/40 p-2 text-xs">
                  <span className="text-muted-foreground">This build isn't signed, so it can't update itself. Install manually:</span>
                  <code className="select-all rounded bg-background p-1 font-mono text-foreground">
                    brew upgrade --cask midnite-studio
                  </code>
                </div>
              )}
            </div>
          </Field>
        </div>
      </Accordion>
    </div>
  );
}
