import { BrandMark } from './brand';
import type { FabTab } from '../store/ui-store';
import { useUiStore } from '../store/ui-store';
import { LuBrain, LuBot, LuHeartHandshake } from 'react-icons/lu';
import { GiDogHouse } from 'react-icons/gi';

interface FabPanelProps {
  isOpen: boolean;
  width: number;
}

const FAB_TABS: Array<{ id: FabTab; label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = [
  { id: 'innovate', label: 'Innovate', icon: LuBrain, color: 'text-blue-500' },
  { id: 'automate', label: 'Automate', icon: LuBot, color: 'text-green-500' },
  { id: 'watchdog', label: 'Watchdog', icon: GiDogHouse, color: 'text-yellow-500' },
  { id: 'medic', label: 'Medic', icon: LuHeartHandshake, color: 'text-red-500' },
];

export function FabPanel({ isOpen, width }: FabPanelProps) {
  const activeFabTab = useUiStore((s) => s.activeFabTab);
  const setActiveFabTab = useUiStore((s) => s.setActiveFabTab);

  if (!isOpen) return null;

  return (
    <div className="shrink-0 overflow-hidden" style={{ width }}>
      <div className="fab-panel-gradient h-full w-full rounded-l-lg border border-border bg-popover flex flex-col">
        {/* Tab Bar */}
        <div className="flex border-b border-border">
          {FAB_TABS.map(({ id, label, icon: Icon, color }) => (
            <button
              key={id}
              onClick={() => setActiveFabTab(id)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 transition-colors ${
                activeFabTab === id
                  ? 'bg-accent text-accent-foreground'
                  : 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              title={label}
            >
              <Icon className={`h-4 w-4 ${color}`} />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-3">
          <div className="flex flex-col items-center gap-2">
            <BrandMark className="h-6 w-6" />
            <h2 className="text-xs font-semibold">{FAB_TABS.find(t => t.id === activeFabTab)?.label} Panel</h2>
          </div>
          <div className="mt-4 text-sm text-muted-foreground">Content for {activeFabTab}</div>
        </div>
      </div>
    </div>
  );
}
