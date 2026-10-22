import { useCallback, useEffect, useState } from 'react';

import type { BrowserPermissionRecord } from '@midnite/studio-shared';
import { useDialogs } from '../../../components/dialog-host';
import { bridge } from '../../../services/bridge';
import { useBrowserStore } from '@midnite/studio-feature-browser/renderer/store';
import { useUiStore } from '../../../store/ui-store';
import { Choice, TextArea } from './controls';

/**
 * Browser settings.
 *
 * "Clear browsing data" landed with Phase 32 Theme B; "Link handling" is
 * Phase 71 Theme A, since the ad hoc click-modifier theme unified: Mod/Ctrl,
 * Mod+Shift and Alt/Option are now fixed, app-wide gestures (see the section's own
 * hint text below), and this control is what a plain click falls back to —
 * the stored preference for a hand-off link (a PR in Reviews, a run in
 * Actions, a link in a rendered commit message, a hyperlink a terminal
 * emitted) whose destination Midnite has no native view for. "Preview
 * deployments" is Theme D's own allowlist — the hosts the Reviews view will
 * offer to open beside a diff.
 */
export function BrowserPage() {
  const dialogs = useDialogs();
  const [clearing, setClearing] = useState(false);
  const linkTarget = useUiStore((s) => s.linkTarget);
  const discardMs = useUiStore((s) => s.browserDiscardMs);
  const setDiscardMs = useUiStore((s) => s.setBrowserDiscardMs);
  const spellcheck = useUiStore((s) => s.browserSpellcheck);
  const setSpellcheck = useUiStore((s) => s.setBrowserSpellcheck);
  const clipboardWatch = useUiStore((s) => s.browserClipboardWatch);
  const setClipboardWatch = useUiStore((s) => s.setBrowserClipboardWatch);
  const downloads = useUiStore((s) => s.browserDownloads);
  const setDownloads = useUiStore((s) => s.setBrowserDownloads);
  const privacy = useUiStore((s) => s.browserPrivacy);
  const setPrivacy = useUiStore((s) => s.setBrowserPrivacy);
  const previewDeployHosts = useBrowserStore((s) => s.previewDeployHosts);
  // Local, raw text rather than deriving straight from the store: parsing on
  // every keystroke would rejoin the list and normalise blank lines out from
  // under the cursor mid-edit. Committed to the store on blur instead.
  const [hostsText, setHostsText] = useState(() => previewDeployHosts.join('\n'));
  const [permissions, setPermissions] = useState<BrowserPermissionRecord[]>([]);

  const refreshPermissions = useCallback(() => {
    void bridge()
      ?.browser.permissionsList()
      .then((list) => {
        setPermissions(list ?? []);
      })
      .catch(() => {
        setPermissions([]);
      });
  }, []);

  useEffect(() => {
    refreshPermissions();
  }, [refreshPermissions]);

  const onRevokePermission = (origin: string, permission: string) => {
    void bridge()
      ?.browser.permissionRevoke({ origin, permission })
      .then(refreshPermissions);
  };

  const onResetAllPermissions = () => {
    dialogs.confirm({
      title: 'Reset all site permissions?',
      body: 'Clears every remembered permission grant and denial across all sites in the embedded browser. Sites will prompt again on their next request.',
      confirmLabel: 'Reset all',
      danger: true,
      blastRadius: null,
      onConfirm: () => {
        void bridge()
          ?.browser.permissionsReset()
          .then(refreshPermissions);
      },
    });
  };

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
        <h3 className="font-semibold text-foreground text-xs" data-settings-section="link-handling">Link handling</h3>
        {/*
          The help text names every modifier verbatim, and that is the point
          of it: a modifier nobody is told about is a modifier nobody uses.
          Mod/Ctrl and Shift, Mod+Shift, and Alt/Option, are fixed — they are not
          affected by the choice below, which only governs what a plain click
          falls back to once Midnite has checked whether it has a page of its
          own for the link (a PR opens PrDetail, an issue opens IssueDetail,
          and so on — the link never reaches this choice at all when one of
          those matches).
        */}
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          Mod (Cmd/Ctrl)-click or Shift-click a link to always open it in your system browser —
          in the terminal too. Mod+Shift-click to open it inside Midnite: on Midnite&apos;s own
          page for it when there is one, otherwise in the Midnite browser below. Alt
          (Option)-click to always open it in the Midnite browser, even for a link Midnite has
          its own page for (not in the terminal, where Alt-click moves the cursor). Middle-click opens a background tab. A plain click on a
          link Midnite recognises — a pull request, an issue, a run — opens that page instead of
          either browser; everything else falls back to the choice here.
        </p>
        <Choice<'in-app' | 'system'>
          label="Fall back to"
          hint="What a plain click on a link Midnite has no page for opens."
          value={linkTarget}
          onChange={(next) => useUiStore.getState().setLinkTarget(next)}
          options={[
            ['in-app', 'Midnite browser', 'The default — links open in a tab in the pane below'],
            ['system', 'System browser', 'Links leave the app, the way they did before'],
          ]}
        />
      </div>

      <div className="flex flex-col gap-3 border border-border rounded-lg p-4 bg-card">
        <h3 className="font-semibold text-foreground text-xs" data-settings-section="preview-deployments">Preview deployments</h3>
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
        <h3 className="font-semibold text-foreground text-xs" data-settings-section="memory">Memory</h3>
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
        <h3 className="font-semibold text-foreground text-xs" data-settings-section="spellcheck">Spellcheck</h3>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-medium text-foreground">Check spelling while typing</div>
            <div className="text-muted-foreground text-[11px]">
              Chromium&apos;s spellchecker sends typed text to the OS spellchecking service. Off by default.
            </div>
          </div>
          <input
            type="checkbox"
            checked={spellcheck}
            onChange={(event) => setSpellcheck(event.target.checked)}
            aria-label="Check spelling while typing"
            data-testid="browser-settings-spellcheck-toggle"
            className="rounded border border-border bg-card"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 border border-border rounded-lg p-4 bg-card">
        <h3 className="font-semibold text-foreground text-xs" data-settings-section="clipboard-watch">Clipboard</h3>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-medium text-foreground">Warn when a page copies a command</div>
            <div className="text-muted-foreground text-[11px]">
              While a browser window is focused, Midnite checks the clipboard once a second for a shell command a
              page just put there (a &ldquo;paste this into Terminal&rdquo; lure) and offers to clear it. Only a hash
              is kept. On by default.
            </div>
          </div>
          <input
            type="checkbox"
            checked={clipboardWatch}
            onChange={(event) => setClipboardWatch(event.target.checked)}
            aria-label="Warn when a page copies a command"
            data-testid="browser-settings-clipboard-watch-toggle"
            className="rounded border border-border bg-card"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 border border-border rounded-lg p-4 bg-card">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground text-xs" data-settings-section="site-permissions">Site permissions</h3>
          {permissions.length > 0 ? (
            <button
              type="button"
              onClick={onResetAllPermissions}
              data-testid="reset-all-permissions-btn"
              className="rounded border border-border px-2.5 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              Reset all
            </button>
          ) : null}
        </div>
        <p className="text-muted-foreground text-[11px]">
          Permissions remembered for sites in the embedded browser (camera, microphone, location, notifications).
        </p>
        {permissions.length === 0 ? (
          <div className="text-muted-foreground text-[11px] py-1">No site permissions remembered yet.</div>
        ) : (
          <div className="flex flex-col divide-y divide-border border border-border rounded-md overflow-hidden">
            {permissions.map((p) => (
              <div key={`${p.origin}:${p.permission}`} className="flex items-center justify-between px-3 py-2 bg-card/50">
                <div className="flex flex-col">
                  <span className="font-mono text-[11px] text-foreground">{p.origin}</span>
                  <span className="text-[10px] text-muted-foreground capitalize">
                    {p.permission} • <strong className={p.value === 'allow' ? 'text-primary' : 'text-destructive'}>{p.value}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onRevokePermission(p.origin, p.permission)}
                  data-testid={`revoke-permission-${p.origin}-${p.permission}`}
                  className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground hover:bg-accent"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 border border-border rounded-lg p-4 bg-card">
        <h3 className="font-semibold text-foreground text-xs" data-settings-section="downloads">Downloads</h3>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-medium text-foreground">Allow downloads</div>
            <div className="text-muted-foreground text-[11px]">
              Off by default: every download is cancelled. When on, files are saved to a quarantine folder with
              macOS&apos;s quarantine flag set, hashed (SHA-256) and logged. Installers, disk images, scripts and
              archives ask first; nothing is ever opened for you.
            </div>
          </div>
          <input
            type="checkbox"
            checked={downloads.enabled}
            onChange={(event) => setDownloads({ ...downloads, enabled: event.target.checked })}
            aria-label="Allow downloads"
            data-testid="browser-settings-downloads-toggle"
            className="rounded border border-border bg-card"
          />
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">Quarantine folder (blank = ~/Downloads/Midnite Quarantine)</span>
          <input
            type="text"
            value={downloads.folder}
            disabled={!downloads.enabled}
            onChange={(event) => setDownloads({ ...downloads, folder: event.target.value })}
            placeholder="~/Downloads/Midnite Quarantine"
            aria-label="Quarantine folder"
            data-testid="browser-settings-downloads-folder"
            className="rounded border border-border bg-card px-2 py-1 font-mono text-[11px] disabled:opacity-50"
          />
        </label>
      </div>

      <div className="flex flex-col gap-3 border border-border rounded-lg p-4 bg-card">
        <h3 className="font-semibold text-foreground text-xs" data-settings-section="privacy">Privacy</h3>
        <p className="text-muted-foreground text-[11px]">
          Network-level protections for the embedded browser, on by default. Canvas, audio and font
          fingerprinting are not defended against: that needs a script inside the page, which Midnite never injects.
          Tracker list: EasyPrivacy (CC BY-SA 3.0 / GPL 3), bundled with the app.
        </p>
        {(
          [
            ['blockTrackers', 'Block known trackers', 'Cancels third-party requests that match the EasyPrivacy list.'],
            ['blockThirdPartyCookies', 'Block third-party cookies', 'Strips cookies sent to, and set by, other sites. Turn off if a login or payment frame breaks.'],
            ['trimReferrer', 'Trim the referrer', 'Other sites see only your site\'s origin, never the full address.'],
            ['reduceUserAgent', 'Reduce the user agent', 'Reports only the Chromium major version, with no app or Electron version.'],
          ] as const
        ).map(([key, label, hint]) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <div>
              <div className="font-medium text-foreground">{label}</div>
              <div className="text-muted-foreground text-[11px]">{hint}</div>
            </div>
            <input
              type="checkbox"
              checked={privacy[key]}
              onChange={(event) => setPrivacy({ ...privacy, [key]: event.target.checked })}
              aria-label={label}
              data-testid={`browser-settings-privacy-${key}`}
              className="rounded border border-border bg-card"
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 border border-border rounded-lg p-4 bg-card">
        <h3 className="font-semibold text-foreground text-xs" data-settings-section="data">Data</h3>
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
