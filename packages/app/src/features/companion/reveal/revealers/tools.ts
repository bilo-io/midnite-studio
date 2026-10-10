import type { FamilyRevealers } from '../types';
import { unavailableRevealer } from './stub';

/** Tools + settings — Phase 112 Theme F fills these. */
export type ToolsResourceKind = 'dbTable' | 'apiRequest' | 'browserTab' | 'setting';

export const TOOLS_REVEALERS: FamilyRevealers<ToolsResourceKind> = {
  dbTable: unavailableRevealer('database'),
  apiRequest: unavailableRevealer('apiClient'),
  // The browser is a panel, not a view (Phase 81 Theme B) — no view switch.
  browserTab: unavailableRevealer(null),
  setting: unavailableRevealer('settings'),
};
