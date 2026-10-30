// Moved to the terminal feature — `packages/features/terminal/main` (Phase 123 Theme E.3). The service now
// reaches the pty service, the agent-conversation locator and the logger through ports; this module binds
// them to desktop's own, once, and re-exports the service so every importer keeps its path.
import { setTerminalPorts } from '@midnite/studio-feature-terminal/main';

import { locateAgentConversation } from './agent-conversation';
import { defaultLogger } from './log';
import {
  activityFor,
  dropScrollback,
  livePtyFor,
  onSessionExit,
  readScrollback,
  scrollbackSessionIds,
  seedScrollback,
} from './pty-service';

setTerminalPorts({
  pty: { activityFor, dropScrollback, livePtyFor, onSessionExit, readScrollback, scrollbackSessionIds, seedScrollback },
  locateAgentConversation,
  log: defaultLogger,
});

export {
  agentSessionDetail,
  configureTerminals,
  flushScrollback,
  forgetTerminal,
  getOrLocateConversationId,
  listAgents,
  listSessionIds,
  listTerminals,
  liveAgentSessions,
  noteSessionExitForTest,
  reorderTerminals,
  resetTerminalsForTest,
  saveTerminal,
  shutdownTerminals,
  startTerminalFlush,
  watchSessionExits,
  whenArchivesSettle,
  type ForgetIntent,
} from '@midnite/studio-feature-terminal/main';
