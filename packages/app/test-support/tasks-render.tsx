/**
 * `@testing-library/react`, with only the two ports the Tasks feature reads installed around every
 * `render` and `renderHook` — Studio's frame chrome and its `TasksHost` (Phase 113 Theme O).
 *
 * For the Tasks component tests that replace `ui-store` with a hand-rolled fake: `StudioProviders`
 * (`studio-render.tsx`) loads every feature's adapter, and several of those subscribe to the real
 * store at import, which a fake without `subscribe` cannot answer. These two ports are exactly what
 * the views reached by import before they moved into the package, so the module graph a test loads is
 * the one it loaded then. Assertions still run against Studio's real chrome, terminal store and hooks.
 */
import type { ReactElement, ReactNode } from 'react';

import {
  render as rtlRender,
  renderHook as rtlRenderHook,
  type RenderHookOptions,
  type RenderOptions,
} from '@testing-library/react';

import { FrameChromeProvider } from '@midnite/studio-frame';
import { TasksHostProvider } from '@midnite/studio-feature-tasks/renderer';

import { STUDIO_CHROME } from '../src/compose/studio-chrome';
import { STUDIO_TASKS_HOST } from '../src/compose/tasks-host';

export * from '@testing-library/react';

function TasksProviders({ children }: { children: ReactNode }) {
  return (
    <FrameChromeProvider chrome={STUDIO_CHROME}>
      <TasksHostProvider host={STUDIO_TASKS_HOST}>{children}</TasksHostProvider>
    </FrameChromeProvider>
  );
}

function withOuter(Outer: RenderOptions['wrapper']) {
  return Outer
    ? ({ children }: { children: ReactNode }) => (
        <TasksProviders>
          <Outer>{children}</Outer>
        </TasksProviders>
      )
    : TasksProviders;
}

/** A test's own `wrapper` (a `DialogHost`, say) nests inside the ports, so `rerender` keeps both. */
export function render(ui: ReactElement, options: RenderOptions = {}) {
  return rtlRender(ui, { ...options, wrapper: withOuter(options.wrapper) });
}

export function renderHook<Result, Props>(hook: (props: Props) => Result, options: RenderHookOptions<Props> = {}) {
  return rtlRenderHook(hook, { ...options, wrapper: withOuter(options.wrapper) });
}
