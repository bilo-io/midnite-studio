import { WebAppsDock } from './web-apps-dock';
import { BrowserTabStrip } from './browser-tab-strip';
import { BrowserToolbar } from './browser-toolbar';
import { AgentSessionBar } from './agent-session-bar';
import { BrowserCanvas } from './browser-canvas';

export function BrowserShell() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-neutral-950 font-sans text-neutral-100 antialiased select-none">
      {/* Web-Apps Rail Dock on the left */}
      <WebAppsDock />

      {/* Main browser column */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top tabs */}
        <BrowserTabStrip />

        {/* Toolbar & Address bar */}
        <BrowserToolbar />

        {/* Agent driving session bar if active */}
        <AgentSessionBar />

        {/* Full-window browsing canvas */}
        <BrowserCanvas />
      </div>
    </div>
  );
}
