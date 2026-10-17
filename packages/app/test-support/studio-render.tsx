/**
 * `@testing-library/react`, with Studio's composition root (`StudioProviders`) installed around every
 * `render` and `renderHook` — and nothing else, unlike `renderView`'s full stack.
 *
 * For the git graph's and diff's component tests (Phase 113 Theme O): those components moved into the
 * frame and now read Studio's chrome and stores through the `GitHost` port, so a test that rendered a
 * row bare must now render it inside the port Studio installs. Swapping the import line is the whole
 * change; every assertion still runs against Studio's real `Tooltip`, `ui-store` and icons.
 */
import type { ReactElement } from 'react';

import {
  render as rtlRender,
  renderHook as rtlRenderHook,
  type RenderHookOptions,
  type RenderOptions,
} from '@testing-library/react';

import { StudioProviders } from '../src/compose/studio-providers';

export * from '@testing-library/react';

export function render(ui: ReactElement, options: Omit<RenderOptions, 'wrapper'> = {}) {
  return rtlRender(ui, { wrapper: StudioProviders, ...options });
}

export function renderHook<Result, Props>(
  hook: (props: Props) => Result,
  options: RenderHookOptions<Props> = {},
) {
  const Outer = options.wrapper;
  const wrapper = Outer
    ? ({ children }: { children: React.ReactNode }) => (
        <StudioProviders>
          <Outer>{children}</Outer>
        </StudioProviders>
      )
    : StudioProviders;
  return rtlRenderHook(hook, { ...options, wrapper });
}
