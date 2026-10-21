import { render as baseRender, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';

import { StudioProviders } from '../studio-providers';

/**
 * `render` under Studio's real providers (Phase 113 Theme N).
 *
 * The workflows feature reads its chrome through the frame port and its layout, dismiss stack and
 * node sessions through its host port, so every view test renders under the same providers the app
 * installs — the suites that moved here from `features/workflows/` are the proof the move changed
 * nothing a user can see. A test that needs a dialog host nests its own `DialogHost` inside.
 */
export function render(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return baseRender(ui, { wrapper: StudioProviders, ...options });
}
