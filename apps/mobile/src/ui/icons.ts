// The one icon family: Feather from @expo/vector-icons (Phase 146 decision 7). `ICONS` is the doc's icon map, keyed by
// what a glyph means, so a screen asks for `history` and never for `git-commit`. `Icon` is the only place a glyph is
// drawn and this file the only importer of the family (eslint `no-restricted-imports`); `icons.test.ts` checks every
// value against Feather's own glyph map.
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@bilo-io/ui-native';
import { createElement, type ComponentProps, type ReactElement } from 'react';

export type FeatherGlyph = ComponentProps<typeof Feather>['name'];

export const ICONS = {
  // Tabs
  history: 'git-commit',
  tasks: 'trello',
  reviews: 'git-pull-request',
  agents: 'cpu',
  more: 'more-horizontal',
  // Shell
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
  // Tasks views
  board: 'columns',
  list: 'list',
  graph: 'share-2',
  // Status
  offline: 'wifi-off',
  error: 'alert-triangle',
  checkPassed: 'check-circle',
  checkFailed: 'x-circle',
  checkPending: 'clock',
  // Actions and detail
  copy: 'copy',
  externalLink: 'external-link',
  comment: 'message-square',
  reply: 'corner-down-right',
  // Beyond the doc's table: small glyphs the screens need
  check: 'check',
  close: 'x',
  info: 'info',
  maximize: 'maximize-2',
  shieldOff: 'shield-off',
  // Agent providers (Theme J)
  providerClaude: 'terminal',
  providerCodex: 'code',
  providerGemini: 'star',
  providerJules: 'cloud',
  providerCopilot: 'github',
} as const satisfies Record<string, FeatherGlyph>;

export type IconName = keyof typeof ICONS;

/** Draws one glyph by meaning. Size defaults to 20 and colour to the theme's `foreground`. */
export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }): ReactElement {
  const theme = useTheme();
  return createElement(Feather, { name: ICONS[name], size, color: color ?? theme.colors.foreground });
}
