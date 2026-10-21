import { reportIssueMenuItem, reportMain } from '@midnite/studio-feature-report/main';
import {
  buildSuiteMenuTemplate,
  createIpcContext,
  type IpcContextElectron,
  type LogSink,
  type SuiteMenuItem,
} from '@midnite/studio-runtime';

/** What touches the OS, injected so registration is testable under bare vitest. */
export type ReportElectron = {
  /** The crash log, resolved per call — a session may fail to open it. */
  sink: () => LogSink | null;
  homeDir: () => string;
  /** The diagnostics bundle's first line: which build this is. */
  bootLine: () => string;
  openExternal: (url: string) => Promise<void> | void;
  writeClipboard: (text: string) => void;
  revealPath: (path: string) => void;
};

/** Report an Issue's channels (the report feature's main half) over Media's own context. */
export function registerReport(el: IpcContextElectron, services: ReportElectron): void {
  reportMain.register(createIpcContext(el), services);
}

/** The shared suite menu; Help ▸ Report an Issue… sends `reportOpen` to the window `send` targets. */
export function reportMenuTemplate(send: (channel: string, payload: unknown) => void): SuiteMenuItem[] {
  return buildSuiteMenuTemplate({ reportItem: reportIssueMenuItem(send) });
}
