import { useQuery } from '@tanstack/react-query';
import { FORGE_CLI_ITEM, setupItem } from '@midnite/studio-shared';
import { LuKeyRound } from 'react-icons/lu';

import { useUiStore } from '../../../store/ui-store';
import { resolveSetupIcon } from '../setup-icons';
import { SetupInstallActions } from '../setup-install-actions';
import { SetupStatusRow, setupRowStatus } from '../setup-status-row';
import { useInstallRunner, useSetupProbe } from '../install-runner';
import { SETUP_FORGES } from './forge-select-page';

/**
 * The forge-CLI page (Phase 98 Theme E): one Theme D status row per forge
 * picked on the previous page. `gh` reuses `forge.cliStatus` (Phase 27) so a
 * signed-out `gh` shows its `gh auth login` hint; `glab` and `az` are plain
 * catalogue probes. Bitbucket has no official CLI, so it gets an explanatory
 * line instead of a row that could only ever spin.
 */
export function ForgeCliPage() {
  const selected = useUiStore((s) => s.setupState.forges ?? []);
  const forges = SETUP_FORGES.filter((f) => selected.includes(f.kind));
  const ids = ['homebrew', ...forges.flatMap((f) => FORGE_CLI_ITEM[f.kind] ?? [])];
  const probe = useSetupProbe(ids);
  const auth = useQuery({
    queryKey: ['setup-gh-auth'],
    queryFn: () => window.midniteStudio?.forge?.cliStatus() ?? Promise.resolve(null),
    enabled: selected.includes('github'),
    refetchOnWindowFocus: true,
  });
  const runner = useInstallRunner(() => {
    void probe.refetch();
    void auth.refetch();
  });
  const brewInstalled = probe.data?.homebrew?.installed ?? false;

  if (forges.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No forge picked yet. Go back to choose one, or skip — Midnite Studio works with plain git
        remotes too.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Each forge&apos;s command-line tool lets Midnite Studio use your existing sign-in.
      </p>
      {forges.map(({ kind, label, icon: Icon, color }) => {
        const itemId = FORGE_CLI_ITEM[kind];
        if (!itemId) {
          return (
            <div
              key={kind}
              data-testid="setup-forge-no-cli"
              className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2"
            >
              <LuKeyRound aria-hidden className="h-5 w-5 shrink-0 text-muted-foreground" />
              <Icon aria-hidden className="h-4 w-4 shrink-0" style={{ color }} />
              <div className="flex flex-col">
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs text-muted-foreground">Token-based, no CLI needed</span>
              </div>
            </div>
          );
        }
        const item = setupItem(itemId)!;
        const result = probe.data?.[itemId];
        const signedOut =
          kind === 'github' && result?.installed && auth.data?.reason === 'not-authenticated';
        const status = setupRowStatus({
          loading: probe.isPending,
          installing: runner.running,
          installed: probe.isPending ? undefined : Boolean(result?.installed),
        });
        const detail = !result?.installed
          ? `${item.label} — not installed`
          : signedOut
            ? `Not signed in — run ${auth.data?.hint || 'gh auth login'}`
            : kind === 'azure'
              ? `${result.version ?? 'installed'} — also needs: az extension add --name azure-devops`
              : (result.version ?? result.path);
        return (
          <SetupStatusRow
            key={kind}
            label={`${label} — ${item.label}`}
            status={status}
            icon={resolveSetupIcon(item.icon)}
            brandColor={item.brandColor}
            detail={detail}
            onRevealTerminal={runner.reveal}
            action={
              <SetupInstallActions
                items={[item]}
                brewInstalled={brewInstalled}
                onRun={runner.run}
                disabled={runner.running}
              />
            }
          />
        );
      })}
    </div>
  );
}
