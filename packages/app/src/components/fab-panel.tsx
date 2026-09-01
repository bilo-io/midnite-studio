import type { FabTab } from '../store/ui-store';
import { useUiStore } from '../store/ui-store';
import { LuBrain, LuBot, LuHeartHandshake } from 'react-icons/lu';
import { GiDogHouse } from 'react-icons/gi';
import { FabTerminalView } from '../features/fab-terminal/fab-terminal-view';

interface FabPanelProps {
  isOpen: boolean;
  width: number;
}

const FAB_TABS: Array<{ id: FabTab; label: string; icon: React.ComponentType<{ className?: string }>; color: string; prompt: string }> = [
  { id: 'innovate', label: 'Innovate', icon: LuBrain, color: 'text-blue-500', prompt: '/loop /midnite-brainstorm' },
  { id: 'automate', label: 'Automate', icon: LuBot, color: 'text-green-500', prompt: '/loop /midnite-exec' },
  { id: 'watchdog', label: 'Watchdog', icon: GiDogHouse, color: 'text-yellow-500', prompt: '/loop /midnite-address-issue' },
  { id: 'medic', label: 'Medic', icon: LuHeartHandshake, color: 'text-red-500', prompt: '/loop /pr-review' },
];

export function FabPanel({ isOpen, width }: FabPanelProps) {
  const activeFabTab = useUiStore((s) => s.activeFabTab);
  const onTabClick = useUiStore((s) => s.onFabTabClick);

  if (!isOpen) return null;

  const tabConfig = FAB_TABS.find((t) => t.id === activeFabTab);

  return (
    <div className="h-full w-full flex flex-col" style={{ width }}>
      <div className="fab-panel-gradient h-full w-full border border-border bg-popover flex flex-col">
        {/* Tab Bar */}
        <div className="flex border-b border-border shrink-0">
          {FAB_TABS.map(({ id, label, icon: Icon, color }) => (
            <button
              key={id}
              onClick={() => onTabClick(id)}
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

        {/* Terminal Views - one for each tab, only active one visible */}
        <div className="flex-1 min-h-0 relative">
          {FAB_TABS.map(({ id, prompt }) => (
            <div
              key={id}
              className={`absolute inset-0 ${activeFabTab === id ? 'visible' : 'invisible'}`}
            >
              <FabTerminalView tabId={id} prompt={prompt} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
