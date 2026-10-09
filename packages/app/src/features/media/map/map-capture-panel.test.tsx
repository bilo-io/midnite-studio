import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultMapProject } from '@midnite/studio-shared';
import { fixtures } from '../../../../test-support/fixtures';
import { renderView } from '../../../../test-support/render';
import { MapPanel } from './map-panel';

afterEach(cleanup);

type Framing = Parameters<typeof MapPanel>[0]['framing'];
const frame = { center: [18.4, -33.9] as [number, number], sideM: 70_000, size: 1025 as const };
const make = (over: Record<string, unknown> = {}): Framing =>
  ({
    terrain3d: { on: true, exaggeration: 1.5 },
    setTerrain3d: vi.fn(),
    setFrame: vi.fn(),
    frame,
    visible: true,
    elevation: { min: 12.4, max: 1085.6 },
    ...over,
  }) as unknown as Framing;

describe('capture framing panel (Phase 108 Theme C)', () => {
  it('reads out side, centre, m/px and sampled elevation', () => {
    renderView(<MapPanel map={defaultMapProject()} project="maps" repoId="r1" framing={make()} />, { fixtures });
    const readout = screen.getByTestId('frame-readout');
    expect(readout.getAttribute('aria-live')).toBe('polite');
    expect(readout.textContent).toContain('70.00 km');
    expect(readout.textContent).toContain('-33.90000, 18.40000');
    expect(readout.textContent).toContain('≈ from preview tiles');
  });

  it('shows the over-cap warning from the capture section, fed by the dragged frame', () => {
    renderView(<MapPanel map={defaultMapProject()} project="maps" repoId="r1" framing={make()} />, { fixtures });
    expect((screen.getByLabelText('Capture side in metres') as HTMLInputElement).value).toBe('70000');
    expect(screen.getByText("Terrain's largest world is 65.5 km a side.")).toBeTruthy();
  });

  it('writes the exaggeration in 0.1 steps', () => {
    const framing = make();
    renderView(<MapPanel map={defaultMapProject()} project="maps" repoId="r1" framing={framing} />, { fixtures });
    const slider = screen.getByLabelText('3D exaggeration') as HTMLInputElement;
    expect(slider.step).toBe('0.1');
    fireEvent.change(slider, { target: { value: '2.2' } });
    expect(framing.setTerrain3d).toHaveBeenCalledWith({ on: true, exaggeration: 2.2 });
  });

  it('prompts for a frame when none is shown', () => {
    renderView(<MapPanel map={defaultMapProject()} project="maps" repoId="r1" framing={make({ frame: null, visible: false })} />, { fixtures });
    expect(screen.getByText('Press F on the map to frame an area.')).toBeTruthy();
  });
});
