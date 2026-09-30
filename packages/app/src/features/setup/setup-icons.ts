import { LuBox } from 'react-icons/lu';
import { SiGit, SiHomebrew } from 'react-icons/si';

import type { SetupIconRef } from '@midnite/studio-shared';

import type { IconComponent } from '../../components/icon-button';

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
};

/** A catalogue row's icon, or a neutral box for one missing from the map. */
export function resolveSetupIcon(ref: SetupIconRef): IconComponent {
  return SETUP_ICONS[`${ref.set}:${ref.name}`] ?? LuBox;
}
