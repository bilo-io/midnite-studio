import { Accordion } from '@bilo-io/ui';
import type { ComponentProps } from 'react';

import { settingsSectionId } from './settings-sections';

/**
 * `Accordion` with an anchor (Phase 112 Theme F): the same section, wrapped in a block that carries
 * `data-settings-section` — the slug of its title — so a reveal can scroll to it, open it if it is
 * collapsed, and flash it (`revealers/tools.ts`). The wrapper adds no styling of its own.
 */
export function SettingsAccordion(props: ComponentProps<typeof Accordion>) {
  return (
    <div data-settings-section={settingsSectionId(props.title)}>
      <Accordion {...props} />
    </div>
  );
}
