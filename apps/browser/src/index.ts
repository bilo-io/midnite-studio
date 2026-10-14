export { BrowserApp } from './browser-app';
export { BrowserShell } from './components/browser-shell';
export { BrowserToolbar } from './components/browser-toolbar';
export { BrowserTabStrip } from './components/browser-tab-strip';
export { WebAppsDock } from './components/web-apps-dock';
export { AgentSessionBar } from './components/agent-session-bar';
export { BrowserCanvas } from './components/browser-canvas';
export { BROWSER_CHROME } from './compose/browser-chrome';
export {
  BrowserHostProvider,
  createDefaultBrowserHost,
  useBrowserHost,
  useBrowserTabs,
  useActiveBrowserTab,
  useBrowserWebApps,
  useActiveWebAppId,
  useAgentSession,
  type BrowserHost,
  type BrowserTab,
  type BrowserWebApp,
  type AgentSessionState,
} from './ports/browser-host';
