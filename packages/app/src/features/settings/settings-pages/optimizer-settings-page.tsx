import { useEffect } from 'react';

import { Accordion } from '@bilo-io/ui';
import { LuGauge, LuHardDrive } from 'react-icons/lu';

import { useDialogs } from '../../../components/dialog-host';
import { useOptimizerStore } from '../../../store/optimizer-store';
import { useUiStore } from '../../../store/ui-store';
import { loadSystemCatalogue } from '../../optimizer/use-optimizer';
import { Field } from './controls';

/**
 * Phase 59 Theme A's opt-in, mirroring `GitSafetyPage`'s shape exactly: a
 * default-off switch behind its own settings section, since scanning and
 * deleting across every registered repo/worktree — and listing/killing
 * system processes — is a different weight of decision than a sync interval.
 */
export function OptimizerSettingsPage() {
  const optimizerEnabled = useUiStore((s) => s.optimizerEnabled);
  const setOptimizerEnabled = useUiStore((s) => s.setOptimizerEnabled);

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="Workspace Optimizer" icon={<LuGauge className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <Field
            label="Enable Workspace Optimizer"
            hint="Adds an Optimizer view with Smart Scan, Storage, Memory and GPU tabs, pointed at the repos/worktrees this app manages plus one folder you pick per scan — never an unscoped disk crawl."
          >
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={optimizerEnabled}
                onChange={(event) => setOptimizerEnabled(event.target.checked)}
                className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
              />
              Enable Workspace Optimizer
            </label>
          </Field>

          <div className="space-y-1.5 rounded-md border border-border/60 bg-card/50 p-3 text-[11px] text-muted-foreground">
            <p className="font-medium text-foreground">What this still never does</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>No sudo and no GPU temperature — the load probe already made that call.</li>
              <li>Delete moves items to the trash, never a bare recursive unlink.</li>
              <li>A kill still asks first, with the process name and full command line shown.</li>
            </ul>
          </div>
        </div>
      </Accordion>

      {optimizerEnabled ? <SystemCachesSection /> : null}
    </div>
  );
}

/**
 * Phase 73 Theme C — the second, stronger gate: cleaning caches outside any
 * repo Midnite manages is a qualitatively bigger blast radius than one ref
 * or the existing Optimizer switch, so it earns a second factor beyond a
 * plain checkbox. Rendered only while `optimizerEnabled` is on — the switch
 * that unlocks a machine-wide delete should not be visible to someone who
 * has not turned the Optimizer on at all.
 */
function SystemCachesSection() {
  const dialogs = useDialogs();
  const allowSystemCacheClean = useUiStore((s) => s.allowSystemCacheClean);
  const setAllowSystemCacheClean = useUiStore((s) => s.setAllowSystemCacheClean);
  const systemCacheConsentGiven = useUiStore((s) => s.systemCacheConsentGiven);
  const setSystemCacheConsentGiven = useUiStore((s) => s.setSystemCacheConsentGiven);
  const catalogue = useOptimizerStore((s) => s.systemCatalogue);

  useEffect(() => {
    void loadSystemCatalogue();
  }, []);

  const labels = (catalogue ?? []).map((entry) => entry.label);

  // The checkbox opens the dialog; the dialog sets the checkbox. Clicking
  // the unchecked box does NOT call setAllowSystemCacheClean(true) directly
  // — only the consent dialog's confirm sets both booleans, so there is no
  // window in which the setting is on without consent recorded. Unchecking
  // (true -> false) is immediate and asks nothing.
  //
  // Consent is a fact about what the user was shown, not a live permission:
  // once `systemCacheConsentGiven` is true, re-checking the box after having
  // unchecked it does not re-ask — the dialog is genuinely one-time, not a
  // gate that reappears on every toggle. Only a fresh install/profile (where
  // consent has never been given) sees it.
  const handleToggle = (checked: boolean): void => {
    if (!checked) {
      setAllowSystemCacheClean(false);
      return;
    }
    if (systemCacheConsentGiven) {
      setAllowSystemCacheClean(true);
      return;
    }
    dialogs.confirm({
      title: 'Allow Midnite to clean caches outside your repos?',
      body: 'Midnite can now scan and clean caches outside any repo it manages, in your home directory. Nothing outside the named list below is ever touched, deletes still go to the Trash first, and this never reaches Photos, Documents, Desktop, or any repo’s actual source.',
      confirmLabel: 'I understand — allow it',
      danger: true,
      // Explicitly null: nothing has been scanned yet, and an absent
      // blastRadius renders "Checking what this affects…", which would be a
      // lie here. `null` skips straight to body + warnings.
      blastRadius: null,
      warnings: labels,
      onConfirm: () => {
        setAllowSystemCacheClean(true);
        setSystemCacheConsentGiven(true);
      },
    });
  };

  return (
    <Accordion title="System caches" icon={<LuHardDrive className="h-4 w-4" />}>
      <div className="flex flex-col gap-4 p-3">
        <Field
          label="Allow cleaning system caches"
          hint="Scans and cleans a fixed, hand-reviewed list of dev-tool caches outside any repo Midnite manages — Cargo, Gradle, Homebrew, and others below — never an unscoped sweep of your home directory."
        >
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={allowSystemCacheClean}
              onChange={(event) => handleToggle(event.target.checked)}
              className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
            />
            Allow cleaning system caches
          </label>
        </Field>

        {labels.length > 0 ? (
          <ul className="list-disc space-y-1 pl-4 text-[11px] text-muted-foreground">
            {labels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        ) : null}

        <div className="space-y-1.5 rounded-md border border-border/60 bg-card/50 p-3 text-[11px] text-muted-foreground">
          <p className="font-medium text-foreground">What this still never does</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>
              Never <code>~/Library</code> wholesale — only the named list above.
            </li>
            <li>Never a path that is a symlink, even a named one.</li>
            <li>Never the system Trash (a separate review).</li>
            <li>Never Plex or another media tool&rsquo;s cache (a separate review).</li>
            <li>
              Never a path this registry doesn&rsquo;t name, and never one from a repo-scan{' '}
              <code>extraRoot</code> picker.
            </li>
          </ul>
        </div>
      </div>
    </Accordion>
  );
}
