import { useState } from 'react';

import {
  CONTAINER_RUNTIME_IDS,
  SETUP_CATALOGUE,
  planSetupInstall,
  type SetupItem,
  type SetupItemGroup,
} from '@midnite/studio-shared';

import { PiDownloadSimple, PiDownloadSimpleFill } from 'react-icons/pi';

import { EmptyStateButton } from '../../../components/empty-state';
import { resolveSetupIcon } from '../setup-icons';
import { SetupMeta } from '../setup-meta';
import { SetupStatusRow, setupRowStatus } from '../setup-status-row';
import { useInstallRunner, useSetupProbe, type SetupProbeMap } from '../install-runner';

export const TOOLCHAIN_GROUPS: readonly { group: SetupItemGroup; title: string; hint?: string }[] =
  [
    { group: 'agent-cli', title: 'Agent CLIs' },
    { group: 'js', title: 'JavaScript runtime' },
    { group: 'containers', title: 'Containers', hint: 'Either one is enough.' },
    { group: 'media', title: 'Media and misc' },
  ];

/** The catalogue rows the page lists, grouped in page order. */
export function toolchainGroups(): {
  group: SetupItemGroup;
  title: string;
  hint?: string;
  items: SetupItem[];
}[] {
  return TOOLCHAIN_GROUPS.map((g) => ({
    ...g,
    items: SETUP_CATALOGUE.filter((item) => item.group === g.group),
  }));
}

/**
 * Whether the probe counts `item` as already there. A container runtime is
 * satisfied by either Docker Desktop or OrbStack, so having one checks both.
 */
export function toolchainSatisfied(item: SetupItem, probes: SetupProbeMap): boolean {
  if ((CONTAINER_RUNTIME_IDS as readonly string[]).includes(item.id)) {
    return CONTAINER_RUNTIME_IDS.some((id) => probes[id]?.installed);
  }
  return Boolean(probes[item.id]?.installed);
}

const TOOL_IDS = toolchainGroups().flatMap((g) => g.items.map((i) => i.id));

/**
 * The toolchain checklist (Phase 98 Theme H) — Theme D's catalogue rows
 * grouped, each drawn in the shared status row with a checkbox, the tool's
 * brand-coloured icon and its detected version. Missing tools start unticked
 * (nothing installs unasked); installed ones are ticked and locked.
 * **Install selected** composes one brew line via `planSetupInstall` and runs
 * it in a visible terminal, then the probe re-runs.
 */
export function ToolchainPage() {
  const probe = useSetupProbe(['homebrew', ...TOOL_IDS]);
  const runner = useInstallRunner(() => {
    setPicked([]);
    void probe.refetch();
  });
  const [picked, setPicked] = useState<string[]>([]);
  const probes = probe.data ?? {};
  const brewInstalled = probes.homebrew?.installed ?? false;

  const chosen = SETUP_CATALOGUE.filter((item) => picked.includes(item.id));
  const options = planSetupInstall(chosen, brewInstalled);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Tick what you want installed. Everything runs as one Homebrew command in a terminal you can
        watch.
      </p>
      <div className="flex max-h-[34vh] flex-col gap-4 overflow-y-auto pr-1">
        {toolchainGroups().map(({ group, title, hint, items }) => (
          <section key={group} aria-label={title} className="flex flex-col gap-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {title}
              {hint ? (
                <span className="ml-2 font-normal normal-case tracking-normal">{hint}</span>
              ) : null}
            </h3>
            {items.map((item) => {
              const satisfied = toolchainSatisfied(item, probes);
              const isPicked = picked.includes(item.id);
              const status = setupRowStatus({
                loading: probe.isPending,
                installing: runner.running && isPicked,
                installed: probe.isPending ? undefined : satisfied,
              });
              return (
                <SetupStatusRow
                  key={item.id}
                  label={item.label}
                  status={status}
                  icon={resolveSetupIcon(item.icon)}
                  brandColor={item.brandColor}
                  meta={
                    probes[item.id]?.installed && probes[item.id]?.version ? (
                      <SetupMeta
                        kind="version"
                        toolId={item.id}
                        label={item.label}
                        version={probes[item.id]!.version!}
                      />
                    ) : undefined
                  }
                  onRevealTerminal={runner.reveal}
                  leading={
                    <input
                      type="checkbox"
                      aria-label={`Install ${item.label}`}
                      checked={satisfied || isPicked}
                      disabled={satisfied || runner.running}
                      onChange={() =>
                        setPicked((cur) =>
                          cur.includes(item.id)
                            ? cur.filter((id) => id !== item.id)
                            : [...cur, item.id],
                        )
                      }
                      className="h-4 w-4 shrink-0 accent-primary"
                    />
                  }
                />
              );
            })}
          </section>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {options.length === 0 ? (
          <EmptyStateButton
            icon={PiDownloadSimple}
            filledIcon={PiDownloadSimpleFill}
            label="Install selected"
            disabled
            onClick={() => undefined}
          />
        ) : (
          options.map((option, index) => (
            index === 0 ? (
              <EmptyStateButton
                key={option.id}
                icon={PiDownloadSimple}
                filledIcon={PiDownloadSimpleFill}
                label={option.id === 'brew' ? 'Install selected' : option.label}
                disabled={runner.running}
                onClick={() => runner.run(option.command, 'Toolchain install')}
              />
            ) : (
              <button
                key={option.id}
                type="button"
                disabled={runner.running}
                onClick={() => runner.run(option.command, 'Toolchain install')}
                className="rounded border border-border px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                {option.label}
              </button>
            )
          ))
        )}
      </div>
    </div>
  );
}
