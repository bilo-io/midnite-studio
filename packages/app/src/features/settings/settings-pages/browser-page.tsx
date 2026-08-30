import { useState } from 'react';

import { useDialogs } from '../../../components/dialog-host';
import { bridge } from '../../../services/bridge';

/**
 * Browser settings (Theme B). Just "Clear browsing data" this batch — the
 * search-engine and link-handling settings Themes G/I need are not part of
 * this slice.
 */
export function BrowserPage() {
  const dialogs = useDialogs();
  const [clearing, setClearing] = useState(false);

  const onClearData = () => {
    dialogs.confirm({
      title: 'Clear browsing data?',
      body: 'Removes every cookie, cache entry and stored login for the embedded browser — including any signed-in GitHub or Figma session. Open tabs stay open, but any page that needed a login will show it again on its next load.',
      confirmLabel: 'Clear browsing data',
      danger: true,
      blastRadius: null,
      onConfirm: () => {
        setClearing(true);
        void bridge()
          ?.browser.clearData()
          .finally(() => setClearing(false));
      },
    });
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-xl text-xs text-foreground font-sans">
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-1">Browser</h2>
        <p className="text-muted-foreground">
          The embedded browser (Mod+B) keeps its own persistent storage, separate from the app —
          logging into GitHub or Figma there survives a relaunch.
        </p>
      </div>

      <div className="flex flex-col gap-3 border border-border rounded-lg p-4 bg-card">
        <h3 className="font-semibold text-foreground text-xs">Data</h3>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-medium text-foreground">Clear browsing data</div>
            <div className="text-muted-foreground text-[11px]">
              Wipes cookies, cache and storage for every browser tab's session.
            </div>
          </div>
          <button
            type="button"
            disabled={clearing}
            onClick={onClearData}
            className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {clearing ? 'Clearing…' : 'Clear data'}
          </button>
        </div>
      </div>
    </div>
  );
}
