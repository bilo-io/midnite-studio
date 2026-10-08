import { defaultMapProject } from '@midnite/studio-shared';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import { renderView } from '../../../../test-support/render';
import { MapCaptureSection } from './map-capture-section';
import { useMapPlaceStore } from './map-place-store';

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

  it('names the capture after the searched place while the frame is near it, not once it has moved away', async () => {
    renderView(<MapCaptureSection repoId="r1" project="maps" map={defaultMapProject()} />, { fixtures });
    const capture = vi.spyOn(window.midniteStudio!.media.map, 'capture');
    act(() => useMapPlaceStore.setState({ place: { name: 'Cape Town, Western Cape', center: [18.42, -33.92] } }));
    fireEvent.click(screen.getByRole('button', { name: 'Capture heightmap' }));
    await waitFor(() => expect(capture).toHaveBeenCalledTimes(1));
    expect(capture.mock.calls[0]![0].place).toBe('Cape Town, Western Cape');
    await screen.findByTestId('capture-done');
    act(() => useMapPlaceStore.setState({ place: { name: 'Oslo', center: [10.75, 59.91] } }));
    fireEvent.click(screen.getByRole('button', { name: 'Capture heightmap' }));
    await waitFor(() => expect(capture).toHaveBeenCalledTimes(2));
    expect(capture.mock.calls[1]![0].place).toBeUndefined();
    act(() => useMapPlaceStore.setState({ place: null }));
  });
});
