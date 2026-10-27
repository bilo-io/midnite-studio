/**
 * The report feature's renderer half: Report an Issue for any midnite app.
 *
 * Mount `<ReportIssueHost app="midnite-<name>" />` once at the app root; open it with
 * `openReportIssue()`. `ReportIssueDialog` is the same dialog for a local `open` state (a Settings
 * page's button). See `../bridge.ts` and `../main` for the other two halves.
 */
export { composeIssueBody, ReportIssueDialog, ReportIssueHost, type ReportIssueDialogProps } from './report-issue-dialog';
export { openReportIssue, useReportIssueStore, type ReportIssueState } from './report-issue-store';
