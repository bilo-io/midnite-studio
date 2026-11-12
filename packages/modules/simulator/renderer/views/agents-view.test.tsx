// vitest/jsdom: the Agent environments toggle and side panel; the WebGL scene is stubbed (jsdom has no GL).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FrameChromeProvider } from '@midnite/studio-frame';

import { SIMULATOR_CHROME } from '../compose/simulator-chrome';
import { AgentsView } from './agents-view';

vi.mock('./agents-scene', () => ({ AgentsScene: () => null }));

afterEach(cleanup);

const mount = () =>
  render(
    <FrameChromeProvider chrome={SIMULATOR_CHROME}>
      <AgentsView />
    </FrameChromeProvider>,
  );

describe('AgentsView', () => {
  it('opens on flocking with its sliders and no population chart', () => {
    mount();
    expect(screen.getByRole('radio', { name: 'Flocking' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByLabelText('Cohesion')).toBeDefined();
    expect(screen.queryByRole('img', { name: /Prey/ })).toBeNull();
  });

  it('switches to predator-prey, swapping the sliders and showing the chart', () => {
    mount();
    fireEvent.click(screen.getByRole('radio', { name: 'Predator–prey' }));
    expect(screen.getByLabelText('Predators')).toBeDefined();
    expect(screen.queryByLabelText('Cohesion')).toBeNull();
    expect(screen.getByRole('img', { name: /Prey/ })).toBeDefined();
  });

  it('edits a parameter', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Count'), { target: { value: '800' } });
    expect((screen.getByLabelText('Count') as HTMLInputElement).value).toBe('800');
  });
});
