import type { FamilyRevealers } from '../types';
import { unavailableRevealer } from './stub';

/** Agent work — Phase 112 Theme D fills these. */
export type AgentResourceKind = 'chat' | 'session' | 'council' | 'workflow' | 'board' | 'card';

export const AGENT_REVEALERS: FamilyRevealers<AgentResourceKind> = {
  chat: unavailableRevealer('chats'),
  // A live session lives in the terminal panel (no view switch); a closed one on Sessions.
  session: unavailableRevealer((ref) => (ref.closed ? 'sessions' : null)),
  council: unavailableRevealer('councils'),
  workflow: unavailableRevealer('workflows'),
  board: unavailableRevealer('tasks'),
  card: unavailableRevealer('tasks'),
};
