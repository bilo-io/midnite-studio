import { SETTINGS_PAGES, useUiStore, type SettingsPageId } from '../../store/ui-store';
import { AgentPage } from './settings-pages/agent-page';
import { AppearancePage } from './settings-pages/appearance-page';
import { GraphPage } from './settings-pages/graph-page';
import { TerminalPage } from './settings-pages/terminal-page';

/**
 * Settings, as pages behind an inner sidebar (Phase 16).
 *
 * The rail stays view navigation; this slim page list is one view's internal
 * structure — the VS Code split, and the shape that scales as pages accrue.
 * The pre-16 "Graph style" and "Appearance" sections became the first two
 * pages one-to-one; Terminal and Agent are new.
 */
const PAGE_CONTENT: Record<SettingsPageId, () => React.ReactNode> = {
  appearance: () => <AppearancePage />,
  graph: () => <GraphPage />,
  terminal: () => <TerminalPage />,
  agent: () => <AgentPage />,
};

export function SettingsView() {
  const page = useUiStore((s) => s.settingsPage);
  const setPage = useUiStore((s) => s.setSettingsPage);
  const label = SETTINGS_PAGES.find((entry) => entry.id === page)?.label ?? 'Settings';

  return (
    <div className="flex h-full min-h-0">
      <nav aria-label="Settings pages" className="w-44 shrink-0 border-r border-border py-3">
        <h1 className="px-3 pb-2 text-sm font-semibold tracking-tight">Settings</h1>
        <ul className="flex flex-col gap-0.5 px-2">
          {SETTINGS_PAGES.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                aria-current={entry.id === page ? 'page' : undefined}
                onClick={() => setPage(entry.id)}
                className={`w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                  entry.id === page
                    ? 'bg-primary/10 font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {entry.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 flex-1 overflow-y-auto">
        {/* Keyed so switching page replays the entrance fade, like view switches. */}
        <div key={page} className="mx-auto max-w-3xl animate-fade-in px-4 py-4">
          <h2 className="pb-3 text-lg font-semibold tracking-tight">{label}</h2>
          {PAGE_CONTENT[page]()}
        </div>
      </div>
    </div>
  );
}
