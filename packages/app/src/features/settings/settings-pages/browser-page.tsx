import { useState } from 'react';

import { useDialogs } from '../../../components/dialog-host';
import { bridge } from '../../../services/bridge';
import { useUiStore } from '../../../store/ui-store';
import { Choice } from './controls';

/**
 * Browser settings.
 *
 * "Clear browsing data" landed with Phase 32 Theme B; "Link handling" is
 * Phase 71 Theme A — the one control that decides whether every hand-off link
 * in the app (a PR in Reviews, a run in Actions, a link in a rendered commit
 * message, a hyperlink a terminal emitted) opens in the pane below or leaves
 * for the system browser.
 */
export function BrowserPage() {
  const dialogs = useDialogs();
  const [clearing, setClearing] = useState(false);
  const linkTarget = useUiStore((s) => s.linkTarget);

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
        <h3 className="font-semibold text-foreground text-xs">Link handling</h3>
        {/*
          The help text names all three modifiers verbatim, and that is the
          point of it: a modifier nobody is told about is a modifier nobody
          uses, and these three are what make the default cheap to reject
          without opening this page at all.
        */}
        <Choice<'in-app' | 'system'>
          label="Open links in"
          hint="Cmd-click opens a link in the other one. Shift-click always uses your system browser. Middle-click opens a background tab."
          value={linkTarget}
          onChange={(next) => useUiStore.getState().setLinkTarget(next)}
          options={[
            ['in-app', 'Midnite browser', 'The default — links open in a tab in the pane below'],
            ['system', 'System browser', 'Links leave the app, the way they did before'],
          ]}
        />
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
