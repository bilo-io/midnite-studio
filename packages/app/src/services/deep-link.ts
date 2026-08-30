import { useEffect, useState } from 'react';
import { useUiStore } from '../store/ui-store';
import { bridge } from './bridge';
import type { DeepLink } from '@midnite/studio-shared';

export function useDeepLinks() {
  const selectRepo = useUiStore((s) => s.selectRepo);
  const [proposedLink, setProposedLink] = useState<DeepLink | null>(null);

  useEffect(() => {
    const b = bridge();
    if (!b?.protocol) return;

    const unsub = b.protocol.onDeepLink(({ link, known }) => {
      if (link.kind === 'open') {
        if (known) {
          const repoId = `repo:${link.repo}`;
          selectRepo(repoId);
        } else {
          setProposedLink(link);
        }
      } else if (link.kind === 'clone') {
        setProposedLink(link);
      }
    });

    return unsub;
  }, [selectRepo]);

  return { proposedLink, clearProposal: () => setProposedLink(null) };
}
