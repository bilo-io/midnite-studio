import { defaultMapProject } from '@midnite/studio-shared';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import { renderView } from '../../../../test-support/render';
import { MapCaptureSection } from './map-capture-section';

afterEach(cleanup);

describe('MapCaptureSection', () => {
  it('shows metres/px and the elevation zoom for the frame', () => {
    renderView(<MapCaptureSection repoId="r1" project="maps" map={defaultMapProject()} />, { fixtures });
    expect(screen.getByTestId('capture-mpp').textContent).toBe('4.88');
    expect(screen.getByTestId('capture-zoom').textContent).toMatch(/^z1[0-5] · \d+ tiles$/);
  });

  it('disables Capture over the Terrain cap and says why', () => {
    renderView(<MapCaptureSection repoId="r1" project="maps" map={defaultMapProject()} />, { fixtures });
    fireEvent.change(screen.getByLabelText('Capture side in metres'), { target: { value: '70000' } });
    expect((screen.getByRole('button', { name: 'Capture heightmap' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toBe("Terrain's largest world is 65.5 km a side.");
  });

  it('captures through the bridge with a caller-chosen id and shows the result', async () => {
    renderView(<MapCaptureSection repoId="r1" project="maps" map={defaultMapProject()} />, { fixtures });
    const capture = vi.spyOn(window.midniteStudio!.media.map, 'capture');
    fireEvent.click(screen.getByRole('button', { name: 'Capture heightmap' }));
    await waitFor(() => expect(capture).toHaveBeenCalled());
    expect(capture.mock.calls[0]![0]).toMatchObject({ repoId: 'r1', project: 'maps', sideM: 5000, size: 1025, center: [18.4241, -33.9249] });
    expect(capture.mock.calls[0]![0].captureId).toBeTruthy();
    expect(capture.mock.calls[0]![0].handoff).toBeUndefined();
    expect((await screen.findByTestId('capture-done')).textContent).toContain('captures/mock-capture-20260101-000000');
  });

  it('Capture and build hands off with a build; Capture only hands off without one', async () => {
    renderView(<MapCaptureSection repoId="r1" project="maps" map={defaultMapProject()} />, { fixtures });
    const capture = vi.spyOn(window.midniteStudio!.media.map, 'capture');
    fireEvent.click(screen.getByRole('button', { name: 'Capture and build' }));
    await waitFor(() => expect(capture).toHaveBeenCalledTimes(1));
    expect(capture.mock.calls[0]![0]).toMatchObject({ handoff: true, build: true });
    await screen.findByTestId('capture-done');
    fireEvent.click(screen.getByRole('button', { name: 'Capture only' }));
    await waitFor(() => expect(capture).toHaveBeenCalledTimes(2));
    expect(capture.mock.calls[1]![0]).toMatchObject({ handoff: true });
    expect(capture.mock.calls[1]![0].build).toBeUndefined();
  });

  it('asks for the satellite and roads by default, and honours the checkboxes', async () => {
    renderView(<MapCaptureSection repoId="r1" project="maps" map={defaultMapProject()} />, { fixtures });
    const capture = vi.spyOn(window.midniteStudio!.media.map, 'capture');
    fireEvent.click(screen.getByRole('button', { name: 'Capture heightmap' }));
    await waitFor(() => expect(capture).toHaveBeenCalledTimes(1));
    expect(capture.mock.calls[0]![0]).toMatchObject({ satellite: true, roads: true });
    await screen.findByTestId('capture-done');
    fireEvent.click(screen.getByLabelText('Satellite image'));
    fireEvent.click(screen.getByLabelText('Roads (OpenStreetMap)'));
    fireEvent.click(screen.getByRole('button', { name: 'Capture heightmap' }));
    await waitFor(() => expect(capture).toHaveBeenCalledTimes(2));
    expect(capture.mock.calls[1]![0]).toMatchObject({ satellite: false, roads: false });
  });

  it('warns that roads are skipped above 25 km only while roads are on, without blocking', () => {
    renderView(<MapCaptureSection repoId="r1" project="maps" map={defaultMapProject()} />, { fixtures });
    fireEvent.change(screen.getByLabelText('Capture side in metres'), { target: { value: '30000' } });
    expect(screen.getByRole('status').textContent).toBe('Roads are captured for frames up to 25 km a side.');
    expect((screen.getByRole('button', { name: 'Capture heightmap' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByLabelText('Roads (OpenStreetMap)'));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('lists what a capture is missing, with the reason', async () => {
    renderView(<MapCaptureSection repoId="r1" project="maps" map={defaultMapProject()} />, { fixtures });
    const real = window.midniteStudio!.media.map.capture;
    vi.spyOn(window.midniteStudio!.media.map, 'capture').mockImplementation(async (req) => {
      const r = await real(req);
      if (!r.ok) return r;
      return { ok: true, value: { ...r.value, capture: { ...r.value.capture, missing: [{ slot: 'roads', reason: 'No roads in this area.' }] } } };
    });
    fireEvent.click(screen.getByRole('button', { name: 'Capture heightmap' }));
    const missing = await screen.findByTestId('capture-missing');
    expect(missing.textContent).toContain('Captured with 1 missing: roads');
    expect(missing.textContent).toContain('roads: No roads in this area.');
  });
});
