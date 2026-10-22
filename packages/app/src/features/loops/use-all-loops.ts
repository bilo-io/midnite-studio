import { DEFAULT_LOOPS, type LoopDefinition } from '@midnite/studio-shared';
import { useMemo } from 'react';

import { useUiStore } from '../../store/ui-store';
import { loopSpectrumProps } from './loop-spectrum';

/**
 * Every loop the FAB panel has a tab for: the six built-ins, then the user's
 * own (`customLoops`), in tab order. One list, so every surface that walks
 * the loops — the tab bar, the statuses, the attention toasts — walks the same
 * ones. Memoised on the custom list, so the array is stable between edits.
 */
export function useAllLoops(): readonly LoopDefinition[] {
  const customLoops = useUiStore((s) => s.customLoops);
  return useMemo(() => [...DEFAULT_LOOPS, ...customLoops], [customLoops]);
}

/** A loop's tab label — a custom loop's name can be empty while it is being typed. */
export function loopLabel(loop: Pick<LoopDefinition, 'label'>): string {
  return loop.label.trim().length > 0 ? loop.label : 'Untitled loop';
}

/**
 * The spread an element that says `data-fab-tab={activeFabTab}` needs when the
 * active tab is a custom loop (`loopSpectrumProps`) — for the FAB buttons that
 * sit outside the panel and carry the active tab's arc.
 */
export function useActiveLoopSpectrum(): ReturnType<typeof loopSpectrumProps> {
  const activeFabTab = useUiStore((s) => s.activeFabTab);
  const loop = useUiStore((s) => s.customLoops.find((entry) => entry.id === activeFabTab));
  return loopSpectrumProps(loop);
}
