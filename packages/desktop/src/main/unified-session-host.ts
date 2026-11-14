import { activityFor, createPty, killPty, livePtyFor, onSessionExit } from './pty-service';
import {
  getOrLocateConversationId,
  getTerminal,
  listAgents,
  saveTerminalNow,
} from './terminal-service';
import {
  createUnifiedSessionCoordinator,
  type UnifiedSessionCoordinator,
} from './unified-session-coordinator';
import { getChatsRuntime } from './ipc/chats-handlers';

let coordinator: UnifiedSessionCoordinator | null = null;

/** Lazily constructs Studio's singleton unified session coordinator (Phase 146 Theme C). */
export function getUnifiedSessionCoordinator(): UnifiedSessionCoordinator {
  if (!coordinator) {
    const instance = createUnifiedSessionCoordinator({
      chatService: () => getChatsRuntime().service,
      getTerminal,
      saveTerminalNow,
      getOrLocateConversationId,
      listAgents,
      livePtyFor,
      activityFor,
      createPty,
      killPty,
      scratchRoot: () => getChatsRuntime().scratchRoot,
    });
    onSessionExit((sessionId) => instance.onPtyExit(sessionId));
    coordinator = instance;
  }
  return coordinator;
}
