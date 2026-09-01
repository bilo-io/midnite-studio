import { useEffect } from 'react';
import { BrandMark } from './brand';
import type { FabTab } from '../store/ui-store';
import { useUiStore } from '../store/ui-store';
import { LuBrain, LuBot, LuHeartHandshake } from 'react-icons/lu';
import { GiDogHouse } from 'react-icons/gi';
import { startAgent } from '../features/terminal/start-agent';
import { useRepos } from '../services/queries';

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
  const fabTabSessions = useUiStore((s) => s.fabTabSessions);
  const onTabClick = useUiStore((s) => s.onFabTabClick);
  const setFabTabSession = useUiStore((s) => s.setFabTabSession);
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);

  const repos = useRepos();
  const selectedRepo = repos.data?.find((r) => r.id === selectedRepoId);

  useEffect(() => {
    if (!selectedRepoId || !selectedRepo) return;

    const sessionId = fabTabSessions[activeFabTab];
    if (sessionId) {
      // Session already exists for this tab, just switch to it
      // The terminal system handles this
      return;
    }

    // Spawn a new terminal session for this tab
    const tabConfig = FAB_TABS.find((t) => t.id === activeFabTab);
    if (!tabConfig) return;

    startAgent({
      repoId: selectedRepoId,
      cwd: selectedRepo.path,
      title: `${tabConfig.label}`,
      prompt: tabConfig.prompt,
      agentId: 'claude',
      command: 'claude',
    });
    // TODO: capture the session ID and store it
    // For now, we just store a placeholder
    setFabTabSession(activeFabTab, `session-${activeFabTab}`);
  }, [activeFabTab, selectedRepoId, selectedRepo, fabTabSessions, setFabTabSession]);

  if (!isOpen) return null;

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

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-3 min-h-0">
          <div className="flex flex-col items-center gap-2">
            <BrandMark className="h-6 w-6" />
            <h2 className="text-xs font-semibold">{FAB_TABS.find(t => t.id === activeFabTab)?.label}</h2>
          </div>
          <div className="mt-4 text-sm text-muted-foreground">
            {fabTabSessions[activeFabTab] ? (
              <>Session: {fabTabSessions[activeFabTab]}</>
            ) : (
              <>Starting session...</>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
