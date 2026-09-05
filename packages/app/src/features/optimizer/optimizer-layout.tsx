import type { ReactNode } from 'react';
import { LuCpu, LuHardDrive, LuMemoryStick, LuSparkles } from 'react-icons/lu';

import type { OptimizerTab } from '../../store/optimizer-store';
import { PageDetachMark } from '../../components/page-detach-mark';

/**
 * The four-tab chrome (Phase 59 Theme A) — presentational only, so it can be
 * screenshot without a store. `optimizer-page.tsx` owns the store wiring and
 * is the `ViewId` entry point; this is its body.
 */
const TABS: { id: OptimizerTab; label: string; icon: typeof LuSparkles }[] = [
  { id: 'smartScan', label: 'Smart Scan', icon: LuSparkles },
  { id: 'storage', label: 'Storage', icon: LuHardDrive },
  { id: 'memory', label: 'Memory', icon: LuMemoryStick },
  { id: 'gpu', label: 'GPU', icon: LuCpu },
];

export function OptimizerLayout({
  tab,
  onTabChange,
  children,
}: {
  tab: OptimizerTab;
  onTabChange: (tab: OptimizerTab) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-4 pt-4">
        {/*
          A row around the title, because this header is a two-row block stack
          rather than a flex bar — the mark has to share the title's line, not
          become a third row above it.
        */}
        <div className="flex items-center gap-2 pb-3">
          <PageDetachMark role="optimizer" />
          <h1 className="text-lg font-semibold tracking-tight">Workspace Optimizer</h1>
        </div>
        <nav aria-label="Optimizer tabs" className="flex gap-1">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = id === tab;
            return (
              <button
                key={id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onTabChange(id)}
                className={`flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? 'border-primary font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon aria-hidden className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </nav>
      </header>
      <div key={tab} className="min-h-0 flex-1 animate-fade-in-up overflow-y-auto p-4">
        {children}
      </div>
    </div>
  );
}
