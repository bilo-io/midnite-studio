import { LuCompass, LuLock, LuShieldCheck } from 'react-icons/lu';
import { useActiveBrowserTab, useActiveWebAppId, useBrowserWebApps, useAgentSession } from '../ports/browser-host';

export function BrowserCanvas() {
  const activeTab = useActiveBrowserTab();
  const activeWebAppId = useActiveWebAppId();
  const webApps = useBrowserWebApps();
  const agentSession = useAgentSession();

  const selectedWebApp = webApps.find((a) => a.id === activeWebAppId);

  if (selectedWebApp) {
    return (
      <div
        role="main"
        aria-label={`Web App: ${selectedWebApp.name}`}
        className="relative flex flex-1 flex-col items-center justify-center bg-neutral-900 p-8 text-neutral-300"
      >
        <div className="flex max-w-md flex-col items-center rounded-2xl border border-neutral-800 bg-neutral-950 p-6 text-center shadow-2xl">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-2xl font-bold text-amber-400">
            {selectedWebApp.name.slice(0, 2).toUpperCase()}
          </div>
          <h2 className="text-lg font-semibold text-white">{selectedWebApp.name}</h2>
          <p className="mt-1 text-xs text-neutral-400 font-mono">{selectedWebApp.url}</p>
          <div className="mt-4 flex items-center gap-1.5 rounded-full bg-neutral-900 px-3 py-1 text-xs text-emerald-400">
            <LuShieldCheck className="h-3.5 w-3.5" />
            <span>Partition: persist:app-{selectedWebApp.id}</span>
          </div>
          <p className="mt-4 text-xs text-neutral-500">
            Session credentials and cookies stay isolated from the primary browser tabs.
          </p>
        </div>
      </div>
    );
  }

  if (!activeTab || activeTab.url === 'about:blank') {
    return (
      <div
        role="main"
        aria-label="New Tab Page"
        className="flex flex-1 flex-col items-center justify-center bg-neutral-900 p-8 text-neutral-300"
      >
        <div className="flex max-w-lg flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 text-amber-400 border border-amber-500/30">
            <LuCompass className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Midnite Browser</h2>
          <p className="mt-2 text-sm text-neutral-400">
            Full-window browsing with isolated web-app rails and agent-driven autonomous sessions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="main"
      aria-label={`Web View: ${activeTab.title}`}
      className="relative flex flex-1 flex-col bg-neutral-900"
    >
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <div className="flex w-full max-w-2xl flex-col items-center rounded-xl border border-neutral-800 bg-neutral-950 p-8 shadow-xl">
          <div className="flex items-center gap-2 text-xs font-mono text-neutral-400">
            <LuLock className="h-3.5 w-3.5 text-emerald-500" />
            <span className="truncate">{activeTab.url}</span>
          </div>
          <h1 className="mt-4 text-xl font-semibold text-white">{activeTab.title}</h1>
          <p className="mt-2 text-xs text-neutral-500">
            Full-bleed web contents rendered in Electron WebContentsView engine.
          </p>

          {agentSession.active && (
            <div className="mt-6 w-full rounded-lg border border-amber-500/30 bg-amber-950/20 p-4 text-left text-xs">
              <div className="font-semibold text-amber-400">Agent Inspector Overlay</div>
              <p className="mt-1 text-amber-200">
                Agent is observing DOM mutations and network requests for: <i>{agentSession.goal}</i>
              </p>
              {agentSession.logs.length > 0 && (
                <div className="mt-3 max-h-24 overflow-y-auto rounded bg-black/40 p-2 font-mono text-[11px] text-amber-300">
                  {agentSession.logs.map((log, i) => (
                    <div key={i}>{log}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
