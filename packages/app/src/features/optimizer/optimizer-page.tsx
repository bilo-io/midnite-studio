import { MemoryTab } from './memory-tab';
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
        <MemoryTab />
      )}
    </OptimizerLayout>
  );
}
