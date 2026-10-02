import { LuBot, LuBox, LuBraces, LuCloud, LuSearch } from 'react-icons/lu';
import {
  SiBun,
  SiClaude,
  SiDocker,
  SiFfmpeg,
  SiGit,
  SiGithub,
  SiGitlab,
  SiGooglegemini,
  SiHomebrew,
  SiMoonrepo,
  SiNodedotjs,
  SiOllama,
  SiPnpm,
} from 'react-icons/si';
import { VscAzureDevops } from 'react-icons/vsc';

import type { SetupIconRef, SetupItem } from '@midnite/studio-shared';

import type { IconComponent } from '../../components/icon-button';
import { CodexIcon } from '../../components/icons/codex-icon';
import { JqIcon, OrbStackIcon, RipgrepIcon } from '../../components/icons/tool-marks';

/**
 * The glyphs `SETUP_CATALOGUE` names, by `<set>:<export>` (Phase 98 Theme D).
 *
 * `shared` names an icon as a string pair because it cannot import React; this
 * is where the pair becomes a component. A static map, not `import * as Si`:
 * a namespace import of a whole `react-icons` set is every glyph in it on the
 * bundle, and the catalogue needs a handful. `setup-icons.test.ts` asserts
 * every catalogue row has an entry here, and that each entry is the export it
 * claims to be — so appending a row without its glyph fails the suite.
 */
export const SETUP_ICONS: Readonly<Record<string, IconComponent>> = {
  'si:SiGit': SiGit,
  'si:SiHomebrew': SiHomebrew,
  'si:SiGithub': SiGithub,
  'si:SiGitlab': SiGitlab,
  'si:SiClaude': SiClaude,
  'si:SiGooglegemini': SiGooglegemini,
  'si:SiNodedotjs': SiNodedotjs,
  'si:SiPnpm': SiPnpm,
  'si:SiBun': SiBun,
  'si:SiMoonrepo': SiMoonrepo,
  'si:SiDocker': SiDocker,
  'si:SiFfmpeg': SiFfmpeg,
  'lu:LuCloud': LuCloud,
  'lu:LuBot': LuBot,
  'lu:LuBox': LuBox,
  'lu:LuSearch': LuSearch,
  'lu:LuBraces': LuBraces,
  'si:SiOllama': SiOllama,
};

/** A catalogue row's icon, or a neutral box for one missing from the map. */
export function resolveSetupIcon(ref: SetupIconRef): IconComponent {
  return SETUP_ICONS[`${ref.set}:${ref.name}`] ?? LuBox;
}

/**
 * Per-item overrides for tools whose catalogue ref is a generic Lucide glyph
 * because `SetupIconRef` only names `lu`/`si` exports: a brand mark `react-icons`
 * carries under another set (Azure DevOps, `vsc`) or a local SVG. Keyed by
 * catalogue id; `resolveSetupItemIcon` consults it before the ref.
 */
export const SETUP_ITEM_ICONS: Readonly<Record<string, IconComponent>> = {
  az: VscAzureDevops,
  codex: CodexIcon,
  orbstack: OrbStackIcon,
  ripgrep: RipgrepIcon,
  jq: JqIcon,
};

/** A catalogue row's icon: its per-id brand override, else its `icon` ref. */
export function resolveSetupItemIcon(item: Pick<SetupItem, 'id' | 'icon'>): IconComponent {
  return SETUP_ITEM_ICONS[item.id] ?? resolveSetupIcon(item.icon);
}
