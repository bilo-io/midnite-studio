import { useState, useEffect } from 'react';
import { LuTerminal } from 'react-icons/lu';
import { Accordion } from '@bilo-io/ui';
import { Field } from './controls';
import { useToastStore } from '../../../store/toast-store';
import type { CliStatusResponse } from '@midnite/studio-shared';

export function CliPage() {
  const [status, setStatus] = useState<CliStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addToast = useToastStore((s) => s.addToast);

  const hasBridge = typeof window !== 'undefined' && Boolean(window.midniteStudio?.cli);

  useEffect(() => {
    if (!hasBridge || !window.midniteStudio?.cli) return;
    window.midniteStudio.cli
      .status()
      .then((res) => {
        setStatus(res);
        setError(null);
      })
      .catch((err: unknown) => {
        const errorObj = err as Error;
        setError(errorObj.message ?? 'Failed to check CLI status');
      });
  }, [hasBridge]);

  const handleInstall = async (target: 'auto' | 'user') => {
    if (!hasBridge || !window.midniteStudio?.cli) return;
    setLoading(true);
    setError(null);
    try {
      const res = await window.midniteStudio.cli.install({ target });
      if (res.ok) {
        setStatus(res.value);
      } else {
        const message = res.kind === 'error' ? res.message : 'Installation failed';
        setError(message);
        addToast({ message, status: 'error' });
      }
    } catch (err: unknown) {
      const errorObj = err as Error;
      const message = errorObj.message ?? 'Failed to install CLI';
      setError(message);
      addToast({ message, status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleUninstall = async () => {
    if (!hasBridge || !window.midniteStudio?.cli) return;
    setLoading(true);
    setError(null);
    try {
      const res = await window.midniteStudio.cli.uninstall();
      if (res.ok) {
        setStatus(res.value);
      } else {
        const message = res.kind === 'error' ? res.message : 'Uninstall failed';
        setError(message);
        addToast({ message, status: 'error' });
      }
    } catch (err: unknown) {
      const errorObj = err as Error;
      const message = errorObj.message ?? 'Failed to uninstall CLI';
      setError(message);
      addToast({ message, status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="Command line integration" icon={<LuTerminal className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <Field
            label="midnite-studio CLI"
            hint={
              !hasBridge
                ? 'Available in the desktop app.'
                : status?.installed
                  ? status.managed
                    ? `Symlinked at ${status.path}`
                    : `Managed outside Midnite Studio (${status.path})`
                  : 'Install midnite-studio into your system PATH to open repositories from the shell.'
            }
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {status?.installed ? (
                  <button
                    type="button"
                    disabled={!hasBridge || loading || !status.managed}
                    onClick={handleUninstall}
                    className="rounded bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"
                  >
                    Uninstall CLI
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!hasBridge || loading}
                    onClick={() => handleInstall('auto')}
                    className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    Install CLI Binary
                  </button>
                )}
              </div>

              {error && <div className="text-xs text-destructive">{error}</div>}

              {status?.installed && status.path?.includes('.local/bin') && (
                <div className="mt-2 flex flex-col gap-1 rounded bg-muted/40 p-2 text-xs">
                  <span className="text-muted-foreground">Add to your shell profile (.zshrc / .bashrc) if not on PATH:</span>
                  <code className="select-all rounded bg-background p-1 font-mono text-foreground">
                    export PATH="$HOME/.local/bin:$PATH"
                  </code>
                </div>
              )}
            </div>
          </Field>

          <Field
            label="Shell completions"
            hint="Ships inside the app bundle at Contents/Resources/completions — this never edits your shell profile automatically."
          >
            <div className="flex flex-col gap-2 text-xs">
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground">zsh — add to ~/.zshrc:</span>
                <code className="select-all rounded bg-muted/40 p-1 font-mono text-foreground">
                  fpath+=(&quot;/Applications/Midnite Studio.app/Contents/Resources/completions&quot;)
                </code>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground">bash — add to ~/.bashrc:</span>
                <code className="select-all rounded bg-muted/40 p-1 font-mono text-foreground">
                  source &quot;/Applications/Midnite Studio.app/Contents/Resources/completions/midnite-studio.bash&quot;
                </code>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground">fish — add to ~/.config/fish/config.fish:</span>
                <code className="select-all rounded bg-muted/40 p-1 font-mono text-foreground">
                  source &quot;/Applications/Midnite Studio.app/Contents/Resources/completions/midnite-studio.fish&quot;
                </code>
              </div>
            </div>
          </Field>
        </div>
      </Accordion>
    </div>
  );
}
