import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  ExportLayersList,
  getExportLayerStatus,
  LayerStatusIcon,
  type MapLayerExportDef,
} from './map-capture-layers';

describe('LayerStatusIcon', () => {
  it('renders pending icon with LuClock and text-amber-500', () => {
    const { container } = render(<LayerStatusIcon status="pending" />);
    const icon = container.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute('aria-label')).toBe('Pending');
    expect(icon?.getAttribute('class')).toContain('text-amber-500');
  });

  it('renders running icon with LuLoaderCircle, animate-spin and text-amber-500', () => {
    const { container } = render(<LayerStatusIcon status="running" />);
    const icon = container.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute('aria-label')).toBe('Exporting');
    expect(icon?.getAttribute('class')).toContain('animate-spin');
    expect(icon?.getAttribute('class')).toContain('text-amber-500');
  });

  it('renders completed icon with LuCircleCheck and text-success', () => {
    const { container } = render(<LayerStatusIcon status="completed" />);
    const icon = container.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute('aria-label')).toBe('Completed');
    expect(icon?.getAttribute('class')).toContain('text-success');
  });

  it('renders error icon with LuCircleX and text-destructive', () => {
    const { container } = render(<LayerStatusIcon status="error" />);
    const icon = container.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute('aria-label')).toBe('Failed');
    expect(icon?.getAttribute('class')).toContain('text-destructive');
  });
});

describe('getExportLayerStatus', () => {
  it('handles running stages for dem, satellite, and roads', () => {
    // Stage: plan
    expect(getExportLayerStatus({ layerId: 'dem', phase: 'running', currentStage: 'plan' })).toBe('running');
    expect(getExportLayerStatus({ layerId: 'satellite', phase: 'running', currentStage: 'plan' })).toBe('pending');
    expect(getExportLayerStatus({ layerId: 'roads', phase: 'running', currentStage: 'plan' })).toBe('pending');

    // Stage: dem
    expect(getExportLayerStatus({ layerId: 'dem', phase: 'running', currentStage: 'dem' })).toBe('running');
    expect(getExportLayerStatus({ layerId: 'satellite', phase: 'running', currentStage: 'dem' })).toBe('pending');
    expect(getExportLayerStatus({ layerId: 'roads', phase: 'running', currentStage: 'dem' })).toBe('pending');

    // Stage: encode
    expect(getExportLayerStatus({ layerId: 'dem', phase: 'running', currentStage: 'encode' })).toBe('running');
    expect(getExportLayerStatus({ layerId: 'satellite', phase: 'running', currentStage: 'encode' })).toBe('pending');
    expect(getExportLayerStatus({ layerId: 'roads', phase: 'running', currentStage: 'encode' })).toBe('pending');

    // Stage: satellite
    expect(getExportLayerStatus({ layerId: 'dem', phase: 'running', currentStage: 'satellite' })).toBe('completed');
    expect(getExportLayerStatus({ layerId: 'satellite', phase: 'running', currentStage: 'satellite' })).toBe('running');
    expect(getExportLayerStatus({ layerId: 'roads', phase: 'running', currentStage: 'satellite' })).toBe('pending');

    // Stage: roads
    expect(getExportLayerStatus({ layerId: 'dem', phase: 'running', currentStage: 'roads' })).toBe('completed');
    expect(getExportLayerStatus({ layerId: 'satellite', phase: 'running', currentStage: 'roads' })).toBe('completed');
    expect(getExportLayerStatus({ layerId: 'roads', phase: 'running', currentStage: 'roads' })).toBe('running');

    // Stage: handoff
    expect(getExportLayerStatus({ layerId: 'dem', phase: 'running', currentStage: 'handoff' })).toBe('completed');
    expect(getExportLayerStatus({ layerId: 'satellite', phase: 'running', currentStage: 'handoff' })).toBe('completed');
    expect(getExportLayerStatus({ layerId: 'roads', phase: 'running', currentStage: 'handoff' })).toBe('completed');
  });

  it('handles done phase with and without missing slots', () => {
    expect(getExportLayerStatus({ layerId: 'dem', phase: 'done', missingSlots: [] })).toBe('completed');
    expect(getExportLayerStatus({ layerId: 'satellite', phase: 'done', missingSlots: [] })).toBe('completed');
    expect(getExportLayerStatus({ layerId: 'roads', phase: 'done', missingSlots: [] })).toBe('completed');

    expect(getExportLayerStatus({ layerId: 'satellite', phase: 'done', missingSlots: ['satellite'] })).toBe('error');
    expect(getExportLayerStatus({ layerId: 'roads', phase: 'done', missingSlots: ['roads'] })).toBe('error');
    expect(getExportLayerStatus({ layerId: 'dem', phase: 'done', missingSlots: ['roads'] })).toBe('completed');
  });

  it('handles failed phase according to failedStage', () => {
    // Failed during dem
    expect(getExportLayerStatus({ layerId: 'dem', phase: 'failed', failedStage: 'dem' })).toBe('error');
    expect(getExportLayerStatus({ layerId: 'satellite', phase: 'failed', failedStage: 'dem' })).toBe('pending');
    expect(getExportLayerStatus({ layerId: 'roads', phase: 'failed', failedStage: 'dem' })).toBe('pending');

    // Failed during satellite
    expect(getExportLayerStatus({ layerId: 'dem', phase: 'failed', failedStage: 'satellite' })).toBe('completed');
    expect(getExportLayerStatus({ layerId: 'satellite', phase: 'failed', failedStage: 'satellite' })).toBe('error');
    expect(getExportLayerStatus({ layerId: 'roads', phase: 'failed', failedStage: 'satellite' })).toBe('pending');

    // Failed during roads
    expect(getExportLayerStatus({ layerId: 'dem', phase: 'failed', failedStage: 'roads' })).toBe('completed');
    expect(getExportLayerStatus({ layerId: 'satellite', phase: 'failed', failedStage: 'roads' })).toBe('completed');
    expect(getExportLayerStatus({ layerId: 'roads', phase: 'failed', failedStage: 'roads' })).toBe('error');
  });

  it('handles buildings dynamically when present', () => {
    expect(getExportLayerStatus({ layerId: 'buildings', phase: 'running', currentStage: 'roads' })).toBe('pending');
    expect(
      getExportLayerStatus({
        layerId: 'buildings',
        phase: 'running',
        currentStage: 'buildings' as unknown as import('@midnite/studio-shared').MapCaptureStage,
      }),
    ).toBe('running');
    expect(getExportLayerStatus({ layerId: 'buildings', phase: 'running', currentStage: 'handoff' })).toBe('completed');
    expect(getExportLayerStatus({ layerId: 'buildings', phase: 'done', missingSlots: [] })).toBe('completed');
    expect(getExportLayerStatus({ layerId: 'buildings', phase: 'done', missingSlots: ['buildings'] })).toBe('error');
  });
});

describe('ExportLayersList', () => {
  it('renders empty when no layers are provided', () => {
    const { container } = render(<ExportLayersList layers={[]} getStatus={() => 'pending'} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders layers vertically with their labels and status icons', () => {
    const layers: MapLayerExportDef[] = [
      { id: 'dem', label: 'Heightmap (Elevation DEM)' },
      { id: 'satellite', label: 'Satellite image' },
      { id: 'roads', label: 'Roads (OpenStreetMap)' },
    ];
    render(
      <ExportLayersList
        layers={layers}
        getStatus={(id) => (id === 'dem' ? 'completed' : id === 'satellite' ? 'running' : 'pending')}
      />,
    );

    expect(screen.getByTestId('map-export-layers')).not.toBeNull();
    expect(screen.getByText('Export layers')).not.toBeNull();

    const demItem = screen.getByTestId('layer-export-dem');
    expect(demItem.getAttribute('data-status')).toBe('completed');
    expect(demItem.textContent).toContain('Heightmap (Elevation DEM)');

    const satItem = screen.getByTestId('layer-export-satellite');
    expect(satItem.getAttribute('data-status')).toBe('running');
    expect(satItem.textContent).toContain('Satellite image');

    const roadsItem = screen.getByTestId('layer-export-roads');
    expect(roadsItem.getAttribute('data-status')).toBe('pending');
    expect(roadsItem.textContent).toContain('Roads (OpenStreetMap)');
  });
});
