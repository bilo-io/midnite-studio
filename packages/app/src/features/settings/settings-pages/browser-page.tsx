import { useState } from 'react';

import { useDialogs } from '../../../components/dialog-host';
import { bridge } from '../../../services/bridge';
import { useBrowserStore } from '../../../store/browser-store';
import { useUiStore } from '../../../store/ui-store';
import { Choice, TextArea } from './controls';

/**
 * Browser settings.
 *
 * "Clear browsing data" landed with Phase 32 Theme B; "Link handling" is
 * Phase 71 Theme A — the one control that decides whether every hand-off link
 * in the app (a PR in Reviews, a run in Actions, a link in a rendered commit
 * message, a hyperlink a terminal emitted) opens in the pane below or leaves
 * for the system browser. "Preview deployments" is Theme D's own allowlist —
 * the hosts the Reviews view will offer to open beside a diff.
 */
export function BrowserPage() {
  const dialogs = useDialogs();
  const [clearing, setClearing] = useState(false);
  const linkTarget = useUiStore((s) => s.linkTarget);
  const discardMs = useUiStore((s) => s.browserDiscardMs);
  const setDiscardMs = useUiStore((s) => s.setBrowserDiscardMs);
  const previewDeployHosts = useBrowserStore((s) => s.previewDeployHosts);
  // Local, raw text rather than deriving straight from the store: parsing on
  // every keystroke would rejoin the list and normalise blank lines out from
  // under the cursor mid-edit. Committed to the store on blur instead.
  const [hostsText, setHostsText] = useState(() => previewDeployHosts.join('\n'));

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
        <h3 className="font-semibold text-foreground text-xs">Preview deployments</h3>
        <p className="text-muted-foreground text-[11px]">
          Hosts a check or a PR comment's own link is matched against, before Reviews offers to
          open it beside the diff. One per line. A self-hosted preview domain — the common case in
          a private repo — belongs here; the seven public hosts below are the default.
        </p>
        <TextArea
          label="Preview deployment hosts"
          value={hostsText}
          onChange={setHostsText}
          rows={4}
          placeholder="vercel.app"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              const hosts = hostsText
                .split('\n')
                .map((host) => host.trim())
                .filter((host) => host.length > 0);
              useBrowserStore.getState().setPreviewDeployHosts(hosts);
              setHostsText(hosts.join('\n'));
            }}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            Save hosts
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 border border-border rounded-lg p-4 bg-card">
        <h3 className="font-semibold text-foreground text-xs">Memory</h3>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-medium text-foreground">Discard hidden tabs after</div>
            <div className="text-muted-foreground text-[11px]">
              A tab hidden this long — its own window minimized counts too — loses its process
              until reactivated. Cookies and logins survive; unsaved form text does not. 0 never
              discards. Per-tab "Keep awake" (tab context menu) opts a tab out entirely.
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <input
              type="number"
              min={0}
              max={180}
              step={1}
              value={Math.round(discardMs / 60_000)}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (!Number.isFinite(next)) return;
                setDiscardMs(Math.max(0, Math.round(next)) * 60_000);
              }}
              aria-label="Discard hidden tabs after (minutes)"
              className="w-16 rounded border border-border bg-card px-2 py-1 text-xs tabular-nums"
            />
            <span className="text-muted-foreground">min</span>
          </div>
        </div>
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
