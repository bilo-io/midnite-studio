import { LuPlus, LuLayers } from 'react-icons/lu';
import { useBrowserHost, useBrowserWebApps, useActiveWebAppId } from '../ports/browser-host';

export function WebAppsDock() {
  const host = useBrowserHost();
  const webApps = useBrowserWebApps();
  const activeWebAppId = useActiveWebAppId();

  return (
    <aside
      aria-label="Web Apps Dock"
      className="flex w-14 flex-col items-center border-r border-neutral-800 bg-neutral-950 py-3"
    >
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900 text-amber-400">
        <LuLayers className="h-4 w-4" />
      </div>

      <div className="h-px w-6 bg-neutral-800 mb-3" />

      <div className="flex flex-1 flex-col items-center gap-2">
        {webApps.map((app) => {
          const isActive = activeWebAppId === app.id;
          return (
            <button
              key={app.id}
              type="button"
              aria-label={`Open ${app.name}`}
              aria-pressed={isActive}
              onClick={() => host.toggleWebApp(app.id)}
              className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all ${
                isActive
                  ? 'bg-amber-500/20 text-amber-400 shadow-sm shadow-amber-500/10'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-white'
              }`}
            >
              <span className="text-xs font-semibold uppercase">{app.name.slice(0, 2)}</span>
              {isActive && (
                <span className="absolute -left-1 top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-r-full bg-amber-500" />
              )}
              {app.badge && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-neutral-950">
                  {app.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-auto flex flex-col items-center gap-2">
        <button
          type="button"
          aria-label="Add Web App"
          onClick={() => {
            const name = window.prompt('Web app name:');
            const url = window.prompt('Web app URL:');
            if (name && url) {
              // open as a tab or future web app
              host.openTab(url);
            }
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300"
        >
          <LuPlus className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
