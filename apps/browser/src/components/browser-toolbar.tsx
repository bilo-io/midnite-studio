import { useState, type FormEvent } from 'react';
import { LuArrowLeft, LuArrowRight, LuRotateCw, LuBot, LuGlobe, LuSparkles } from 'react-icons/lu';
import { useBrowserHost, useActiveBrowserTab, useActiveWebAppId, useAgentSession } from '../ports/browser-host';

export function BrowserToolbar() {
  const host = useBrowserHost();
  const activeTab = useActiveBrowserTab();
  const activeWebAppId = useActiveWebAppId();
  const agentSession = useAgentSession();

  const [inputUrl, setInputUrl] = useState(activeTab?.url ?? '');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!activeTab) return;
    let url = inputUrl.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('about:')) {
      if (url.includes('.') && !url.includes(' ')) {
        url = `https://${url}`;
      } else {
        url = `https://duckduckgo.com/?q=${encodeURIComponent(url)}`;
      }
    }
    host.navigate(activeTab.id, url);
  };

  const handleStartAgent = () => {
    const goal = window.prompt('What should the agent do in this session?', 'Inspect page and verify accessibility');
    if (goal) {
      host.startAgentSession(goal);
    }
  };

  return (
    <div className="flex h-11 items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-3 text-neutral-300">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Back"
          disabled={!activeTab?.canGoBack}
          onClick={() => activeTab && host.goBack(activeTab.id)}
          className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:opacity-30"
        >
          <LuArrowLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Forward"
          disabled={!activeTab?.canGoForward}
          onClick={() => activeTab && host.goForward(activeTab.id)}
          className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:opacity-30"
        >
          <LuArrowRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Reload"
          onClick={() => activeTab && host.reload(activeTab.id)}
          className={`rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white ${
            activeTab?.isLoading ? 'animate-spin text-amber-400' : ''
          }`}
        >
          <LuRotateCw className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1">
        <div className="relative flex items-center">
          <span className="pointer-events-none absolute left-2.5 text-neutral-500">
            <LuGlobe className="h-3.5 w-3.5" />
          </span>
          <input
            type="text"
            value={activeWebAppId ? `midnite://web-app/${activeWebAppId}` : (activeTab?.url ?? inputUrl)}
            onChange={(e) => setInputUrl(e.target.value)}
            disabled={Boolean(activeWebAppId)}
            placeholder="Search or enter web address..."
            className="h-7 w-full rounded-md border border-neutral-700 bg-neutral-950 pl-8 pr-4 text-xs text-neutral-200 placeholder-neutral-500 focus:border-amber-500/60 focus:outline-none focus:ring-1 focus:ring-amber-500/40 disabled:opacity-60"
          />
        </div>
      </form>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={agentSession.active ? 'Stop Agent Session' : 'Start Agent Session'}
          onClick={agentSession.active ? () => host.stopAgentSession() : handleStartAgent}
          className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${
            agentSession.active
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30'
              : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'
          }`}
        >
          {agentSession.active ? <LuSparkles className="h-3.5 w-3.5 animate-pulse" /> : <LuBot className="h-3.5 w-3.5" />}
          <span>{agentSession.active ? 'Agent Driving' : 'Agent Drive'}</span>
        </button>
      </div>
    </div>
  );
}
