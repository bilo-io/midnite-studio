// Layer: vitest — pure 3D projection, 3-cluster preview topology, and style picker DOM assertions.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildScene3D,
  buildThreeClusterPreviewPayload,
  computeCurvedEdge2D,
  formatSynapseScore,
  formatTelemetryNodeMetric,
  KNOWLEDGE_STYLE_IDS,
  projectScenePoint,
} from './knowledge-3d-scene';
import { KnowledgeStylePicker } from './knowledge-style-picker';

afterEach(cleanup);

describe('knowledge-3d-scene', () => {
  it('builds a 3-cluster interconnected preview payload with 3 distinct communities and inter-cluster bridges', () => {
    const payload = buildThreeClusterPreviewPayload();
    const communities = new Set(payload.nodes.map((n) => n.community));
    expect([...communities].sort()).toEqual([0, 1, 2]);

    const scene = buildScene3D(payload);
    expect(scene.nodes.length).toBe(payload.nodes.length);
    expect(scene.clusters).toHaveLength(3);

    // Every cluster has non-zero 3D Z depth variation
    const zValues = new Set(scene.nodes.map((n) => Math.round(n.pos[2])));
    expect(zValues.size).toBeGreaterThan(5);

    // Inter-cluster bridges connect all 3 clusters
    const bridgePairs = new Set(
      scene.edges
        .filter((e) => e.sourceCommunity !== e.targetCommunity)
        .map((e) => `${Math.min(e.sourceCommunity, e.targetCommunity)}-${Math.max(e.sourceCommunity, e.targetCommunity)}`),
    );
    expect([...bridgePairs].sort()).toEqual(['0-1', '0-2', '1-2']);
  });

  it('projects 3D points with perspective scaling and computes curved bezier midpoints', () => {
    const near = projectScenePoint([20, -10, -80], -0.3, 0.4, 0, 140, 64, 1.0);
    const far = projectScenePoint([20, -10, 120], -0.3, 0.4, 0, 140, 64, 1.0);
    expect(near.visible).toBe(true);
    expect(far.visible).toBe(true);
    expect(near.scale).toBeGreaterThan(far.scale);

    const curve = computeCurvedEdge2D(10, 20, 110, 80, 0.25);
    expect(curve.mx).not.toBe(60);
    expect(curve.my).not.toBe(50);
  });

  it('formats deterministic 7-decimal synapse confidence weights and telemetry metrics', () => {
    const score = formatSynapseScore(0.95, 1.2, 'edge-1');
    expect(score).toMatch(/^0\.\d{7}$|^1\.0$/);
    const metric = formatTelemetryNodeMetric(4, 'node-a');
    expect(metric).toMatch(/^\d{2}\.\d{3}$/);
  });
});

describe('KnowledgeStylePicker', () => {
  it('renders a card with a 3D 3-cluster thumbnail for every registered presentation style', () => {
    const onSelect = vi.fn();
    render(<KnowledgeStylePicker activeId="telemetry-3d" onSelect={onSelect} />);

    for (const id of KNOWLEDGE_STYLE_IDS) {
      const card = screen.getByTestId(`knowledge-style-card-${id}`);
      expect(card).toBeTruthy();
      expect(card.getAttribute('aria-pressed')).toBe(id === 'telemetry-3d' ? 'true' : 'false');

      const thumb = screen.getByTestId(`knowledge-style-thumb-${id}`);
      // Each thumbnail renders the same 3 interconnected clusters (0, 1, 2)
      expect(thumb.querySelectorAll('[data-cluster="0"]').length).toBe(7);
      expect(thumb.querySelectorAll('[data-cluster="1"]').length).toBe(7);
      expect(thumb.querySelectorAll('[data-cluster="2"]').length).toBe(7);
      expect(thumb.querySelectorAll('[data-intercluster="true"]').length).toBeGreaterThan(8);
    }

    fireEvent.click(screen.getByTestId('knowledge-style-card-synapse-3d'));
    expect(onSelect).toHaveBeenCalledWith('synapse-3d');
  });
});
