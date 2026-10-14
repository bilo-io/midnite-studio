import { LuPlus, LuX, LuCompass } from 'react-icons/lu';
import { useBrowserHost, useBrowserTabs } from '../ports/browser-host';

export function BrowserTabStrip() {
  const host = useBrowserHost();
  const tabs = useBrowserTabs();

  return (
    <div className="flex h-9 items-center gap-1 border-b border-neutral-800 bg-neutral-950 px-2 pt-1 text-xs">
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tab"
            aria-selected={tab.active}
            onClick={() => host.selectTab(tab.id)}
            className={`group flex h-8 max-w-[200px] min-w-[120px] cursor-pointer items-center justify-between gap-1.5 rounded-t-md px-2.5 text-xs transition-colors ${
              tab.active
                ? 'bg-neutral-900 text-neutral-200 border-t-2 border-amber-500'
                : 'text-neutral-400 hover:bg-neutral-900/60 hover:text-neutral-300'
            }`}
          >
            <div className="flex items-center gap-1.5 truncate">
              <LuCompass className="h-3.5 w-3.5 shrink-0 text-neutral-500 group-hover:text-amber-400" />
              <span className="truncate">{tab.title || 'New Tab'}</span>
            </div>
            <button
              type="button"
              aria-label={`Close tab ${tab.title}`}
              onClick={(e) => {
                e.stopPropagation();
                host.closeTab(tab.id);
              }}
              className="rounded p-0.5 text-neutral-500 opacity-60 hover:bg-neutral-800 hover:opacity-100 group-hover:opacity-100"
            >
              <LuX className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        aria-label="Add tab"
        onClick={() => host.openTab('https://github.com/bilo-io/midnite-apps')}
        className="flex h-7 w-7 items-center justify-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-white"
      >
        <LuPlus className="h-4 w-4" />
      </button>
    </div>
  );
}
