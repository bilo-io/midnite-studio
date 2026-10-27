import { useCallback, useEffect, useState } from 'react';
import { LuDatabase, LuEye, LuMapPin, LuShieldCheck } from 'react-icons/lu';

import { useFrameChrome } from '@midnite/studio-frame';

import { SelectField } from '../../../components/form/select-field';
import { SettingsSwitchRow } from '../../../components/form/settings-switch-row';
import { bridge } from '../../../services/bridge';
import { useUiStore } from '../../../store/ui-store';
import { SettingsAccordion } from '../settings-section';

type RetentionValue = 'forever' | '90' | '30' | '7';
const RETENTION_OPTIONS: readonly { value: RetentionValue; label: string }[] = [
  { value: 'forever', label: 'Forever' },
  { value: '90', label: '90 days' },
  { value: '30', label: '30 days' },
  { value: '7', label: '7 days' },
];
const retentionToValue = (days: number | null): RetentionValue =>
  days === 90 || days === 30 || days === 7 ? (String(days) as RetentionValue) : 'forever';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Phase 115 Theme B — how long local history is kept, a way to clear it, and the at-rest note. Chats,
 * settings and live sessions are never part of either.
 */
function LocalHistorySection() {
  const dialogs = useFrameChrome().useDialogs();
  const retention = useUiStore((s) => s.historyRetentionDays);
  const setRetention = useUiStore((s) => s.setHistoryRetentionDays);
  const [fileVault, setFileVault] = useState<'on' | 'off' | 'unknown' | null>(null);
  const [cleared, setCleared] = useState<string | null>(null);

  useEffect(() => {
    void bridge()
      ?.privacy.fileVault()
      .then((r) => setFileVault(r.status), () => setFileVault('unknown'));
  }, []);

  const clear = useCallback(async () => {
    const api = bridge()?.privacy;
    if (!api) return;
    const stats = await api.historyStats();
    dialogs.confirm({
      title: 'Clear all local history?',
      body: 'Deletes terminal scrollback, archived session transcripts and logs. Running sessions, chats and settings are kept.',
      confirmLabel: 'Clear history',
      danger: true,
      warnings: [
        stats.files === 0
          ? 'There is no local history to delete.'
          : `${stats.files} file${stats.files === 1 ? '' : 's'} (${formatBytes(stats.bytes)}) will be permanently deleted. This cannot be undone.`,
      ],
      onConfirm: () => {
        void api.clearHistory().then((r) => setCleared(`Deleted ${r.removedFiles} file${r.removedFiles === 1 ? '' : 's'} (${formatBytes(r.removedBytes)}).`));
      },
    });
  }, [dialogs]);

  return (
    <SettingsAccordion title="Local history" icon={<LuDatabase className="h-4 w-4" />} defaultOpen>
      <div className="flex flex-col gap-4 p-3">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-foreground">Keep local history</p>
          <p className="text-[11px] text-muted-foreground">
            Terminal scrollback and archived session transcripts older than this are deleted when the app starts and
            once a day. Sessions that are still open, and chats, are never deleted.
          </p>
          <SelectField<RetentionValue>
            label="Keep local history"
            value={retentionToValue(retention)}
            onChange={(v) => setRetention(v === 'forever' ? null : Number(v))}
            options={RETENTION_OPTIONS}
          />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-foreground">Clear all local history</p>
          <p className="text-[11px] text-muted-foreground">
            Deletes scrollback, archived transcripts and logs now. You will be shown how much first.
          </p>
          <button
            type="button"
            onClick={() => void clear()}
            className="rounded-md border border-destructive/50 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10"
          >
            Clear all local history…
          </button>
          {cleared ? <p role="status" className="text-[11px] text-muted-foreground">{cleared}</p> : null}
        </div>
        <p className="text-[11px] text-muted-foreground" data-testid="at-rest-note">
          History is stored in files only your macOS account can read, and is protected at rest by macOS file
          permissions and FileVault.{' '}
          {fileVault === 'off' ? (
            <>
              FileVault is <strong>off</strong> on this Mac.{' '}
              <button type="button" className="underline" onClick={() => void bridge()?.privacy.openFileVault()}>
                Open FileVault settings
              </button>
            </>
          ) : fileVault === 'on' ? (
            'FileVault is on.'
          ) : null}
        </p>
      </div>
    </SettingsAccordion>
  );
}

/** Phase 115 Theme F — what Studio reads of Claude's and Codex's own files, and the switch that stops it. */
function AgentHistorySection() {
  const readAgentHistory = useUiStore((s) => s.readAgentHistory);
  const setReadAgentHistory = useUiStore((s) => s.setReadAgentHistory);
  return (
    <SettingsAccordion title="Claude and Codex" icon={<LuEye className="h-4 w-4" />} defaultOpen>
      <div className="flex flex-col gap-4 p-3">
        <p className="text-[11px] text-muted-foreground">
          Studio reads <code>~/.claude/settings.json</code> (<code>enabledPlugins</code>) and the plugin list to offer
          Claude&apos;s skills, <code>~/.claude/projects</code> and <code>~/.codex/sessions</code> to find a session&apos;s
          conversation and to total its token usage. It <strong>never writes</strong> to Claude&apos;s or Codex&apos;s
          configuration, and nothing it reads leaves this Mac.
        </p>
        <SettingsSwitchRow
          id="read-agent-history"
          label="Read Claude and Codex history"
          description="When off, Claude's settings and plugin list and the transcripts under ~/.claude/projects and ~/.codex/sessions are not read. Token usage shows a prompt to turn this back on."
          on={readAgentHistory}
          onToggle={(_id, next) => setReadAgentHistory(next)}
        />
      </div>
    </SettingsAccordion>
  );
}

/**
 * Phase 76 Theme D — privacy controls for network lookups the renderer would
 * otherwise make silently on first load. Phase 117 Theme C adds the browser's
 * reputation feeds: each one a Phase 115 `EGRESS_HOSTS` entry, off by default.
 */
export function PrivacyPage() {
  const locateByIpEnabled = useUiStore((s) => s.locateByIpEnabled);
  const setLocateByIpEnabled = useUiStore((s) => s.setLocateByIpEnabled);
  const reputationFeeds = useUiStore((s) => s.browserReputationFeeds);
  const setReputationFeed = useUiStore((s) => s.setBrowserReputationFeed);

  return (
    <div className="flex flex-col gap-3">
      <LocalHistorySection />
      <AgentHistorySection />
      <SettingsAccordion title="Location" icon={<LuMapPin className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <SettingsSwitchRow
            id="locate-by-ip"
            label="Locate me by IP"
            description="When off, title-bar weather never calls ipwho.is. Set a city manually or enable this switch to allow IP geolocation as a fallback after browser geolocation is denied."
            on={locateByIpEnabled}
            onToggle={(_id, next) => setLocateByIpEnabled(next)}
          />
        </div>
      </SettingsAccordion>
      <SettingsAccordion title="Reputation feeds" icon={<LuShieldCheck className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <p className="text-[11px] text-muted-foreground">
            Open lists of known-bad sites the embedded browser checks every address against. Each list is downloaded
            whole every six hours and matched on this machine, so no address you visit is ever sent anywhere. While
            both are off, the site badge reads &ldquo;No reputation data&rdquo;.
          </p>
          <SettingsSwitchRow
            id="reputation-feed-urlhaus"
            label="URLhaus (abuse.ch)"
            description="Sites distributing malware. Downloaded from urlhaus.abuse.ch; the list is CC0."
            on={reputationFeeds.urlhaus}
            onToggle={(_id, next) => setReputationFeed('urlhaus', next)}
          />
          <SettingsSwitchRow
            id="reputation-feed-openphish"
            label="OpenPhish"
            description="Phishing pages, from the OpenPhish community feed at openphish.com."
            on={reputationFeeds.openphish}
            onToggle={(_id, next) => setReputationFeed('openphish', next)}
          />
        </div>
      </SettingsAccordion>
    </div>
  );
}
