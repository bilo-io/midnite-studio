import { Notification, clipboard } from 'electron';

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
 * The one place the workflow executors touch Electron: `notify`/`clipboard`
 * take their desktop seam as a dependency (see `notify.ts`), bound here to the
 * real `Notification`/`clipboard`. Both are only dereferenced when a node
 * actually runs, so importing this module outside Electron (the executor
 * tests do) never calls into them.
 */
const notifyExecutor = createNotifyExecutor({
  isSupported: () => Notification.isSupported(),
  show: ({ title, body }) => new Notification({ title, body }).show(),
});
const clipboardExecutor = createClipboardExecutor({ writeText: (text) => clipboard.writeText(text) });

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
