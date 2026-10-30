import { reportIssueMenuItem } from '@midnite/studio-feature-report/main';
import { buildSuiteMenuTemplate, type SuiteMenuItem } from '@midnite/studio-runtime';

/** The shared suite menu; Help ▸ Report an Issue… sends `reportOpen` to the window `send` targets. */
export function reportMenuTemplate(send: (channel: string, payload: unknown) => void): SuiteMenuItem[] {
  return buildSuiteMenuTemplate({ reportItem: reportIssueMenuItem(send) });
}
