import { useCallback, useState } from 'react';
import { LuLock, LuToggleRight } from 'react-icons/lu';

import { SettingsSwitchRow, useFeatureTogglesStore, useFrameChrome } from '@midnite/studio-frame';
import {
  dependentsOf,
  FEATURE_TOGGLE_GROUPS,
  FEATURE_TOGGLE_IDS,
  featureToggle,
  isFeatureOn,
  requirementsOf,
  type FeatureToggleId,
} from '@midnite/studio-shared';

import { bridge } from '../../../services/bridge';
import { SettingsAccordion } from '../settings-section';

/** What can never be switched off, and why — listed so the page accounts for every feature. */
const ALWAYS_ON: readonly { label: string; why: string }[] = [
  { label: 'Terminal', why: 'Every agent and tool runs in it.' },
  { label: 'Settings', why: 'This page lives here.' },
  { label: 'Accounts', why: 'Forge, model and agent sign-ins live here.' },
];

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const labels = (ids: readonly FeatureToggleId[]): string => ids.map((id) => featureToggle(id).label).join(', ');

/** The row's second line: what it is, what it needs, what needs it, and when a switch takes hold. */
export function featureRowDescription(id: FeatureToggleId): string {
  const spec = featureToggle(id);
  const needs = requirementsOf(id).filter((other) => other !== id);
  const neededBy = dependentsOf(id);
  return [
    spec.description,
    needs.length > 0 ? `Needs ${labels(needs)}.` : '',
    neededBy.length > 0 ? `${labels(neededBy)} ${neededBy.length === 1 ? 'needs' : 'need'} this.` : '',
    spec.restart ? 'Background work stops after a restart.' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Settings ▸ Features (Phase 135 Theme D) — one switch per feature, grouped as the rail groups them. Off hides the
 * feature everywhere and stops its work in main; its data stays until "Delete data" is used on a feature that is off.
 */
export function FeaturesPage() {
  const dialogs = useFrameChrome().useDialogs();
  const disabled = useFeatureTogglesStore((s) => s.disabled);
  const setEnabled = useFeatureTogglesStore((s) => s.setEnabled);
  const [notice, setNotice] = useState<string | null>(null);

  const toggle = useCallback(
    (id: FeatureToggleId, on: boolean) => {
      setNotice(null);
      const label = featureToggle(id).label;
      if (on) {
        const alsoOn = requirementsOf(id).filter((other) => other !== id && disabled.includes(other));
        setEnabled(id, true);
        if (alsoOn.length > 0) setNotice(`Turned on ${labels(alsoOn)} too — ${label} needs it.`);
        return;
      }
      const dependents = dependentsOf(id).filter((other) => isFeatureOn(disabled, other));
      if (dependents.length === 0) {
        setEnabled(id, false);
        return;
      }
      dialogs.confirm({
        title: `Turn off ${label}?`,
        body: `${labels(dependents)} ${dependents.length === 1 ? 'needs' : 'need'} ${label}, so ${dependents.length === 1 ? 'it is' : 'they are'} turned off too. Data is kept.`,
        confirmLabel: `Turn off ${dependents.length + 1} features`,
        onConfirm: () => setEnabled(id, false),
      });
    },
    [dialogs, disabled, setEnabled],
  );

  const deleteData = useCallback(
    async (id: FeatureToggleId) => {
      const api = bridge()?.features;
      if (!api) return;
      setNotice(null);
      const spec = featureToggle(id);
      const { files } = await api.describeData({ feature: id });
      const storeKeys = spec.data.storeKeys.filter((key) => {
        try {
          return window.localStorage.getItem(key) !== null;
        } catch {
          return false;
        }
      });
      const total = files.reduce((sum, file) => sum + file.bytes, 0);
      dialogs.confirm({
        title: `Delete ${spec.label}'s data?`,
        body: `${spec.label} is off. Its files go to the Trash and its saved view state is cleared; switching it back on starts empty.`,
        confirmLabel: 'Delete data',
        danger: true,
        blastRadiusKind: 'files',
        blastRadius:
          files.length === 0 ? null : { count: files.length, sample: files.map((f) => ({ sha: formatBytes(f.bytes), subject: f.path })) },
        warnings: [
          files.length === 0 ? 'No files on disk.' : `${files.length} item${files.length === 1 ? '' : 's'}, ${formatBytes(total)} in all.`,
          storeKeys.length === 0 ? 'No saved view state.' : `Saved view state cleared: ${storeKeys.join(', ')}.`,
          spec.data.vault.length === 0 ? 'No vault entries.' : `Vault entries kept: ${spec.data.vault.join(', ')}.`,
        ],
        onConfirm: () => {
          void api.deleteData({ feature: id }).then((out) => {
            if (!out.ok) {
              setNotice(out.message);
              return;
            }
            for (const key of storeKeys) {
              try {
                window.localStorage.removeItem(key);
              } catch {
                // Storage blocked: nothing to clear.
              }
            }
            setNotice(
              `Deleted ${spec.label}'s data: ${out.removedFiles} item${out.removedFiles === 1 ? '' : 's'} (${formatBytes(out.removedBytes)}) moved to the Trash${storeKeys.length > 0 ? `, ${storeKeys.length} saved state cleared` : ''}.`,
            );
          });
        },
      });
    },
    [dialogs],
  );

  return (
    <div className="flex flex-col gap-3" data-testid="features-page">
      <p className="px-1 text-xs text-muted-foreground">
        Switch off what you do not use. An off feature leaves the rail, the palette and its shortcuts, and stops its
        background work. Its data is kept until you delete it.
      </p>
      {notice ? (
        <p role="status" className="rounded-md border border-border/60 bg-foreground/[0.03] px-2 py-1.5 text-xs text-foreground">
          {notice}
        </p>
      ) : null}
      {FEATURE_TOGGLE_GROUPS.map((group) => {
        const ids = FEATURE_TOGGLE_IDS.filter((id) => featureToggle(id).group === group.id);
        if (ids.length === 0) return null;
        const offCount = ids.filter((id) => !isFeatureOn(disabled, id)).length;
        return (
          <SettingsAccordion
            key={group.id}
            title={group.label}
            icon={<LuToggleRight className="h-4 w-4" />}
            count={offCount || undefined}
            defaultOpen
          >
            <div className="flex flex-col divide-y divide-border/60 px-3 py-1" data-feature-group={group.id}>
              {ids.map((id) => {
                const on = isFeatureOn(disabled, id);
                const spec = featureToggle(id);
                return (
                  <div key={id} className="flex flex-col gap-1 py-1.5" data-feature-row={id}>
                    <SettingsSwitchRow
                      id={`feature-${id}`}
                      testId={`feature-switch-${id}`}
                      label={spec.label}
                      description={featureRowDescription(id)}
                      title={on ? `Turn off ${spec.label}` : `Turn on ${spec.label}`}
                      on={on}
                      onToggle={(_rowId, next) => toggle(id, next)}
                    />
                    {!on && (spec.data.files.length > 0 || spec.data.storeKeys.length > 0) ? (
                      <button
                        type="button"
                        data-testid={`feature-delete-${id}`}
                        onClick={() => void deleteData(id)}
                        className="h-6 w-fit rounded-md border border-destructive/50 px-2 text-xs text-destructive transition-colors hover:bg-destructive/10"
                      >
                        Delete this feature's data…
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </SettingsAccordion>
        );
      })}
      <SettingsAccordion title="Always on" icon={<LuLock className="h-4 w-4" />} defaultOpen>
        <ul className="flex flex-col divide-y divide-border/60 px-3 py-1">
          {ALWAYS_ON.map((item) => (
            <li key={item.label} className="flex flex-col py-1.5 text-xs">
              <span className="font-medium text-foreground">{item.label}</span>
              <span className="text-muted-foreground">{item.why}</span>
            </li>
          ))}
        </ul>
      </SettingsAccordion>
    </div>
  );
}
