import { workflowsPorts } from '../../ports';
import type { ExecutorRegistry } from '../executor-registry';
import { postGateApprovalComment } from '../gate-forge-service';
import { agentExecutor } from './agent';
import { aiExtractExecutor, aiPromptExecutor } from './ai';
import { commandExecutor } from './command';
import { coalesceExecutor, jsonExtractExecutor, setFieldsExecutor } from './data';
import { readFileExecutor, writeFileExecutor } from './files';
import { forgeCommentExecutor, forgeIssueExecutor, gitStatusExecutor } from './git-forge';
import { assertExecutor, failExecutor } from './guards';
import { createClipboardExecutor, createNotifyExecutor } from './notify';
import { conditionExecutor } from './condition';
import { delayExecutor } from './delay';
import { frameExecutor } from './frame';
import { createGateExecutor } from './gate';
import { httpExecutor } from './http';
import { joinExecutor } from './join';
import { noteExecutor } from './note';
import { policyExecutor } from './policy';
import { routerExecutor } from './router';
import { scriptExecutor } from './script';
import { stateExecutor } from './state';
import { transformExecutor } from './transform';
import { triggerExecutor } from './trigger';
import { verifyExecutor } from './verify';

/**
 * Wired to the real forge layer (`gate-forge-service.ts`) — self-contained
 * (only forge/registry modules, never `workflow-service.ts`/`workflow-engine.ts`),
 * which is what keeps this an ordinary dependency edge rather than a cycle.
 */
const gateExecutor = createGateExecutor({ postApprovalComment: postGateApprovalComment });

/**
 * `notify`/`clipboard` take their desktop seam as a dependency (see
 * `notify.ts`), bound here to the composer's `desktop` port (Studio binds
 * Electron's `Notification`/`clipboard`; an app without one reports the node's
 * own failure). Both are only dereferenced when a node actually runs.
 */
const notifyExecutor = createNotifyExecutor({
  isSupported: () => workflowsPorts().desktop?.notify?.isSupported() ?? false,
  show: (notification) => workflowsPorts().desktop?.notify?.show(notification),
});
const clipboardExecutor = createClipboardExecutor({
  writeText: (text) => {
    const write = workflowsPorts().desktop?.writeClipboard;
    if (!write) throw new Error('This app has no clipboard.');
    write(text);
  },
});

/**
 * The default registry — the one place a node kind is bound to its executor.
 *
 * Exhaustive by type: `ExecutorRegistry` is a `Record` over the `kind` union,
 * so adding node #6 to `workflow.ts` fails to compile here until it has an
 * executor. That is the guard the closed union exists for.
 *
 * The engine takes a registry as a parameter rather than importing this, so a
 * test can inject fakes without touching the real HTTP path.
 */
export const defaultExecutors: ExecutorRegistry = {
  http: httpExecutor,
  transform: transformExecutor,
  condition: conditionExecutor,
  delay: delayExecutor,
  note: noteExecutor,
  agent: agentExecutor,
  script: scriptExecutor,
  join: joinExecutor,
  gate: gateExecutor,
  router: routerExecutor,
  verify: verifyExecutor,
  trigger: triggerExecutor,
  state: stateExecutor,
  frame: frameExecutor,
  policy: policyExecutor,
  'ai-prompt': aiPromptExecutor,
  'ai-extract': aiExtractExecutor,
  assert: assertExecutor,
  fail: failExecutor,
  command: commandExecutor,
  'read-file': readFileExecutor,
  'git-status': gitStatusExecutor,
  'forge-comment': forgeCommentExecutor,
  'forge-issue': forgeIssueExecutor,
  'set-fields': setFieldsExecutor,
  'json-extract': jsonExtractExecutor,
  coalesce: coalesceExecutor,
  notify: notifyExecutor,
  'write-file': writeFileExecutor,
  clipboard: clipboardExecutor,
};

export {
  agentExecutor,
  aiExtractExecutor,
  aiPromptExecutor,
  assertExecutor,
  clipboardExecutor,
  coalesceExecutor,
  commandExecutor,
  failExecutor,
  forgeCommentExecutor,
  forgeIssueExecutor,
  gitStatusExecutor,
  jsonExtractExecutor,
  notifyExecutor,
  readFileExecutor,
  setFieldsExecutor,
  writeFileExecutor,
  conditionExecutor,
  delayExecutor,
  frameExecutor,
  gateExecutor,
  httpExecutor,
  joinExecutor,
  noteExecutor,
  policyExecutor,
  routerExecutor,
  scriptExecutor,
  stateExecutor,
  transformExecutor,
  triggerExecutor,
  verifyExecutor,
};
