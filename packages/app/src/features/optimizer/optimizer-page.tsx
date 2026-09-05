import { OptimizerLayout } from './optimizer-layout';
import { GpuTab } from './gpu-tab';
import { SmartScanTab } from './smart-scan-tab';
import { StorageTab } from './storage-tab';
import { useOptimizerStore } from '../../store/optimizer-store';
import { useOptimizerScanProgress } from './use-optimizer';

/**
 * The `optimizer` view's entry point (Phase 59 Theme A) — owns the store
 * wiring; `OptimizerLayout` is the presentational shell around it.
 */
export function OptimizerPage() {
  const tab = useOptimizerStore((s) => s.tab);
  const setTab = useOptimizerStore((s) => s.setTab);
  useOptimizerScanProgress();

  return (
    <OptimizerLayout tab={tab} onTabChange={setTab}>
      {tab === 'smartScan' ? (
        <SmartScanTab />
      ) : tab === 'storage' ? (
        <StorageTab />
      ) : tab === 'gpu' ? (
        <GpuTab />
      ) : (
        // Theme D (Memory & process monitor) lands in a follow-up batch —
        // its own distinct blast radius (kill-any-process) is deliberately
        // reviewed apart from this one, per the phase doc's Decision 14.
        <p className="text-sm text-muted-foreground">
          The Memory tab lands in a follow-up phase.
        </p>
      )}
    </OptimizerLayout>
  );
}
