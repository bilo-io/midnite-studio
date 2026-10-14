import type { AppInstallState } from '../../common/status';

const LABELS: Record<AppInstallState, string> = {
  checking: 'Checking',
  'not-installed': 'Available to install',
  installed: 'Installed',
  update: 'Update available',
};

export function StatusPill({ state, installing }: { state: AppInstallState; installing: boolean }) {
  const shown = installing ? 'Installing' : LABELS[state];
  return (
    <span className="pill" data-state={installing ? 'installing' : state}>
      {shown}
    </span>
  );
}
