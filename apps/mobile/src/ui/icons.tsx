// The one icon family: Feather from @expo/vector-icons (Phase 146 decision 7, recorded in K2). The names below are
// the doc's icon map; `Icon` is the only place a glyph is drawn, so a screen never imports the family directly.
import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

export type IconName = ComponentProps<typeof Feather>['name'];

export const ICONS = {
  history: 'git-commit',
  tasks: 'trello',
  reviews: 'git-pull-request',
  agents: 'cpu',
  more: 'more-horizontal',
  panel: 'sidebar',
  chevronDown: 'chevron-down',
  chevronLeft: 'chevron-left',
  branch: 'git-branch',
  lock: 'lock',
  plus: 'plus',
  newIssue: 'plus-square',
  openAgent: 'zap',
  switchRepo: 'repeat',
  notes: 'edit-3',
  search: 'search',
  // Theme I
  checkCircle: 'check-circle',
  xCircle: 'x-circle',
  clock: 'clock',
  comment: 'message-square',
  externalLink: 'external-link',
  // Theme J
  info: 'info',
  close: 'x',
} as const satisfies Record<string, IconName>;

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color: string }) {
  return <Feather name={name} size={size} color={color} />;
}
