import { defaultMapProject, type GitOpResult, type MapCaptureProgressEvent, type MapCaptureResult } from '@midnite/studio-shared';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import { installMockBridgeJsdom } from '../../../../test-support/mock-bridge';
import { renderView } from '../../../../test-support/render';
import { MapCaptureSection } from './map-capture-section';
import { useMapPlaceStore } from './map-place-store';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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
    expect(capture.mock.calls[0]![0]).toMatchObject({ satellite: true, roads: true, buildings: true });
    await screen.findByTestId('capture-done');
    fireEvent.click(screen.getByLabelText('Satellite image'));
    fireEvent.click(screen.getByLabelText('Roads (OpenStreetMap)'));
    fireEvent.click(screen.getByLabelText('Buildings (OpenStreetMap)'));
    fireEvent.click(screen.getByRole('button', { name: 'Capture heightmap' }));
    await waitFor(() => expect(capture).toHaveBeenCalledTimes(2));
    expect(capture.mock.calls[1]![0]).toMatchObject({ satellite: false, roads: false, buildings: false });
  });

  it('warns that roads and buildings are skipped on big frames only while each is on, without blocking', () => {
    renderView(<MapCaptureSection repoId="r1" project="maps" map={defaultMapProject()} />, { fixtures });
    fireEvent.change(screen.getByLabelText('Capture side in metres'), { target: { value: '30000' } });
    expect(screen.getAllByRole('status').map((w) => w.textContent)).toEqual([
      'Roads are captured for frames up to 25 km a side.',
      'Buildings are captured for frames up to 10 km a side.',
    ]);
    expect((screen.getByRole('button', { name: 'Capture heightmap' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByLabelText('Roads (OpenStreetMap)'));
    expect(screen.getByRole('status').textContent).toBe('Buildings are captured for frames up to 10 km a side.');
    fireEvent.click(screen.getByLabelText('Buildings (OpenStreetMap)'));
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

  it('renders the vertical export layer list with completed checkmarks when done', async () => {
    renderView(<MapCaptureSection repoId="r1" project="maps" map={defaultMapProject()} />, { fixtures });
    fireEvent.click(screen.getByRole('button', { name: 'Capture heightmap' }));
    await screen.findByTestId('capture-done');

    const layersContainer = screen.getByTestId('map-export-layers');
    expect(layersContainer).not.toBeNull();

    const dem = screen.getByTestId('layer-export-dem');
    expect(dem.getAttribute('data-status')).toBe('completed');
    expect(dem.textContent).toContain('Heightmap (Elevation DEM)');
    expect(screen.getByTestId('layer-icon-dem').querySelector('svg')?.getAttribute('class')).toContain('text-success');

    const sat = screen.getByTestId('layer-export-satellite');
    expect(sat.getAttribute('data-status')).toBe('completed');
    expect(sat.textContent).toContain('Satellite image');
    expect(screen.getByTestId('layer-icon-satellite').querySelector('svg')?.getAttribute('class')).toContain('text-success');

    const roads = screen.getByTestId('layer-export-roads');
    expect(roads.getAttribute('data-status')).toBe('completed');
    expect(roads.textContent).toContain('Roads (OpenStreetMap)');
    expect(screen.getByTestId('layer-icon-roads').querySelector('svg')?.getAttribute('class')).toContain('text-success');

    const bld = screen.getByTestId('layer-export-buildings');
    expect(bld.getAttribute('data-status')).toBe('completed');
    expect(bld.textContent).toContain('Buildings (OpenStreetMap)');
    expect(screen.getByTestId('layer-icon-buildings').querySelector('svg')?.getAttribute('class')).toContain('text-success');
  });

  it('reflects layer progress across pending, running, and completed states', async () => {
    installMockBridgeJsdom(fixtures);
    let progressHandler!: (event: MapCaptureProgressEvent) => void;
    window.midniteStudio!.media.map.onCaptureProgress = (handler) => {
      progressHandler = handler;
      return () => undefined;
    };

    let resolveCapture!: (val: GitOpResult<MapCaptureResult>) => void;
    vi.spyOn(window.midniteStudio!.media.map, 'capture').mockImplementation(
      (_req) =>
        new Promise((resolve) => {
          resolveCapture = (val) => resolve(val);
        }),
    );

    renderView(<MapCaptureSection repoId="r1" project="maps" map={defaultMapProject()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Capture heightmap' }));

    // Initially at 'plan' stage
    expect(screen.getByTestId('layer-export-dem').getAttribute('data-status')).toBe('running');
    expect(screen.getByTestId('layer-icon-dem').querySelector('svg')?.getAttribute('class')).toContain('animate-spin');
    expect(screen.getByTestId('layer-export-satellite').getAttribute('data-status')).toBe('pending');
    expect(screen.getByTestId('layer-icon-satellite').querySelector('svg')?.getAttribute('class')).toContain('text-amber-500');
    expect(screen.getByTestId('layer-export-roads').getAttribute('data-status')).toBe('pending');
    expect(screen.getByTestId('layer-icon-roads').querySelector('svg')?.getAttribute('class')).toContain('text-amber-500');

    // Progress to 'satellite' stage
    const captureCall = vi.mocked(window.midniteStudio!.media.map.capture).mock.calls[0]![0];
    act(() => {
      progressHandler?.({ captureId: captureCall.captureId!, stage: 'satellite', fraction: 0.5 });
    });

    expect(screen.getByTestId('layer-export-dem').getAttribute('data-status')).toBe('completed');
    expect(screen.getByTestId('layer-icon-dem').querySelector('svg')?.getAttribute('class')).toContain('text-success');
    expect(screen.getByTestId('layer-export-satellite').getAttribute('data-status')).toBe('running');
    expect(screen.getByTestId('layer-icon-satellite').querySelector('svg')?.getAttribute('class')).toContain('animate-spin');
    expect(screen.getByTestId('layer-export-roads').getAttribute('data-status')).toBe('pending');

    // Progress to 'roads' stage
    act(() => {
      progressHandler?.({ captureId: captureCall.captureId!, stage: 'roads', fraction: 0.5 });
    });

    expect(screen.getByTestId('layer-export-dem').getAttribute('data-status')).toBe('completed');
    expect(screen.getByTestId('layer-export-satellite').getAttribute('data-status')).toBe('completed');
    expect(screen.getByTestId('layer-icon-satellite').querySelector('svg')?.getAttribute('class')).toContain('text-success');
    expect(screen.getByTestId('layer-export-roads').getAttribute('data-status')).toBe('running');
    expect(screen.getByTestId('layer-icon-roads').querySelector('svg')?.getAttribute('class')).toContain('animate-spin');

    // Finish capture
    act(() => {
      resolveCapture({
        ok: true,
        value: {
          captureId: captureCall.captureId!,
          name: 'test-capture',
          dir: 'captures/test-capture',
          capture: {
            version: 1,
            name: 'test-capture',
            center: [0, 0],
            sideM: 5000,
            size: 1025,
            mPerPx: 5,
            bbox: [0, 0, 1, 1],
            heightMinM: 0,
            heightMaxM: 100,
            hasSea: false,
            sources: { dem: 'aws-terrarium', satellite: 'maptiler-satellite', roads: 'overpass' },
            demZoom: 12,
            attributions: [],
            files: [],
            missing: [],
            capturedAt: '2026-01-01',
          },
        },
      });
    });

    await screen.findByTestId('capture-done');
    expect(screen.getByTestId('layer-export-dem').getAttribute('data-status')).toBe('completed');
    expect(screen.getByTestId('layer-export-satellite').getAttribute('data-status')).toBe('completed');
    expect(screen.getByTestId('layer-export-roads').getAttribute('data-status')).toBe('completed');
  });

  it('shows error cross icon when a layer is missing on completion', async () => {
    renderView(<MapCaptureSection repoId="r1" project="maps" map={defaultMapProject()} />, { fixtures });
    vi.spyOn(window.midniteStudio!.media.map, 'capture').mockResolvedValueOnce({
      ok: true,
      value: {
        captureId: 'test-missing',
        name: 'test-missing',
        dir: 'captures/test-missing',
        capture: {
          version: 1,
          name: 'test-missing',
          center: [0, 0],
          sideM: 5000,
          size: 1025,
          mPerPx: 5,
          bbox: [0, 0, 1, 1],
          heightMinM: 0,
          heightMaxM: 100,
          hasSea: false,
          sources: { dem: 'aws-terrarium' },
          demZoom: 12,
          attributions: [],
          files: [],
          missing: [{ slot: 'roads', reason: 'Overpass query timed out' }],
          capturedAt: '2026-01-01',
        },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Capture heightmap' }));
    await screen.findByTestId('capture-done');

    expect(screen.getByTestId('layer-export-dem').getAttribute('data-status')).toBe('completed');
    expect(screen.getByTestId('layer-export-satellite').getAttribute('data-status')).toBe('completed');
    const roads = screen.getByTestId('layer-export-roads');
    expect(roads.getAttribute('data-status')).toBe('error');
    expect(screen.getByTestId('layer-icon-roads').querySelector('svg')?.getAttribute('class')).toContain('text-destructive');
  });

  it('excludes unchecked layers from the export list', async () => {
    renderView(<MapCaptureSection repoId="r1" project="maps" map={defaultMapProject()} />, { fixtures });
    fireEvent.click(screen.getByLabelText('Satellite image'));
    fireEvent.click(screen.getByRole('button', { name: 'Capture heightmap' }));
    await screen.findByTestId('capture-done');

    expect(screen.getByTestId('layer-export-dem')).not.toBeNull();
    expect(screen.queryByTestId('layer-export-satellite')).toBeNull();
    expect(screen.getByTestId('layer-export-roads')).not.toBeNull();
  });

  it('excludes roads from the export list when roads are skipped (> 25 km)', async () => {
    renderView(<MapCaptureSection repoId="r1" project="maps" map={defaultMapProject()} />, { fixtures });
    fireEvent.change(screen.getByLabelText('Capture side in metres'), { target: { value: '30000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Capture heightmap' }));
    await screen.findByTestId('capture-done');

    expect(screen.getByTestId('layer-export-dem')).not.toBeNull();
    expect(screen.getByTestId('layer-export-satellite')).not.toBeNull();
    expect(screen.queryByTestId('layer-export-roads')).toBeNull();
  });

  it('shows error state when capture fails', async () => {
    renderView(<MapCaptureSection repoId="r1" project="maps" map={defaultMapProject()} />, { fixtures });
    vi.spyOn(window.midniteStudio!.media.map, 'capture').mockResolvedValueOnce({
      ok: false,
      kind: 'error',
      message: 'Failed to fetch elevation tiles.',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Capture heightmap' }));

    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toBe('Failed to fetch elevation tiles.');
    expect(screen.getByTestId('layer-export-dem').getAttribute('data-status')).toBe('error');
    expect(screen.getByTestId('layer-icon-dem').querySelector('svg')?.getAttribute('class')).toContain('text-destructive');
  });
});
