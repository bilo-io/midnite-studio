import {
  RECOMMENDED_GIT_VERSION,
  setupItem,
  setupVersionNumber,
  versionAtLeast,
} from '@midnite/studio-shared';

import { resolveSetupIcon } from '../setup-icons';
import { SetupInstallActions } from '../setup-install-actions';
import { SetupMeta } from '../setup-meta';
import { SetupStatusRow, setupRowStatus } from '../setup-status-row';
import { useInstallRunner, useSetupProbe } from '../install-runner';

const IDS = ['git', 'homebrew'] as const;

/**
 * The git page (Phase 98 Theme E) — a page over Theme D's catalogue, probe,
 * install runner and status row; nothing here is new plumbing.
 *
 * Git is "ready" only at `RECOMMENDED_GIT_VERSION` or newer; an older one reads
 * as missing with the version in the detail, because the fix is the same brew
 * install. This is the first page to surface `planSetupInstall`'s offers:
 * without Homebrew it offers Homebrew's installer first, and Apple's Command
 * Line Tools beside it for git.
 */
export function GitPage() {
  const probe = useSetupProbe(IDS);
  const runner = useInstallRunner(() => void probe.refetch());
  const git = setupItem('git')!;
  const brew = setupItem('homebrew')!;
  const gitProbe = probe.data?.git;
  const brewInstalled = probe.data?.homebrew?.installed ?? false;

  const number = setupVersionNumber(gitProbe?.version);
  const current =
    Boolean(gitProbe?.installed) &&
    (number === null || versionAtLeast(number, RECOMMENDED_GIT_VERSION));
  const status = setupRowStatus({
    loading: probe.isPending,
    installing: runner.running,
    installed: probe.isPending ? undefined : current,
  });
  const detail = !gitProbe?.installed
    ? 'Not installed'
    : current
      ? undefined
      : `Older than the recommended ${RECOMMENDED_GIT_VERSION}`;
  const meta = gitProbe?.installed ? (
    gitProbe.version ? (
      <SetupMeta kind="version" toolId="git" label="git" version={gitProbe.version} />
    ) : gitProbe.path ? (
      <SetupMeta kind="path" toolId="git" label="git" path={gitProbe.path} />
    ) : undefined
  ) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Midnite Studio drives your repositories with the real{' '}
        <code className="font-mono text-foreground">git</code> on this Mac. Version{' '}
        {RECOMMENDED_GIT_VERSION} or newer is recommended.
      </p>
      <SetupStatusRow
        label="git"
        status={status}
        icon={resolveSetupIcon(git.icon)}
        brandColor={git.brandColor}
        detail={detail}
        meta={meta}
        onRevealTerminal={runner.reveal}
        action={
          <SetupInstallActions
            items={[git]}
            brewInstalled={brewInstalled}
            onRun={runner.run}
            disabled={runner.running}
          />
        }
      />
      {!probe.isPending && !brewInstalled && !current ? (
        <SetupStatusRow
          label="Homebrew"
          status="missing"
          icon={resolveSetupIcon(brew.icon)}
          brandColor={brew.brandColor}
          detail="The recommended installer — used for git and the tools on the next pages"
        />
      ) : null}
    </div>
  );
}
