import type { AgentDefinition, CommitProvenance } from '@midnite/studio-shared';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CommitAvatar } from './commit-avatar';

/**
 * The agent glyph's size and position on the graph node — vitest/jsdom, not
 * a browser: this is pure attribute arithmetic (a `foreignObject`'s
 * `x`/`y`/`width`/`height`), no real layout or `getBoundingClientRect`
 * needed to check it. Genuine PAINT-time overlap (whether Chromium actually
 * honours those numbers) is exactly the ambiguity this fix sidesteps — see
 * `commit-avatar.tsx`'s own comment on why a nested `<svg>` couldn't be
 * trusted for it.
 *
 * Regression coverage for the "orange asterisk" bug (Phase 78 Theme C,
 * ad hoc fix): the agent mark rendered at several times its intended size,
 * off-centre from the node, and spilled into the commit-message column.
 */
describe('CommitAvatar: the agent mark stays sized to, and centred on, the node', () => {
  afterEach(() => cleanup());

  const claudeAgent: AgentDefinition = {
    id: 'claude',
    label: 'Claude',
    command: 'claude',
    args: [],
    accent: '#D97757',
  };

  const agentProvenance: CommitProvenance = {
    kind: 'agent',
    source: 'author',
    agentIds: ['claude'],
  };

  const mixedProvenance: CommitProvenance = {
    kind: 'mixed',
    source: 'co-author',
    agentIds: ['claude'],
  };

  function renderAvatar(overrides: {
    provenance: CommitProvenance;
    cx?: number;
    cy?: number;
    size?: number;
  }) {
    const { cx = 40, cy = 16, size = 18 } = overrides;
    const { container } = render(
      <svg>
        <CommitAvatar
          email="claude@example.com"
          name="Claude"
          cx={cx}
          cy={cy}
          size={size}
          ring="hsl(0 0% 50%)"
          ringWidth={2}
          clipId="clip-test"
          provenance={overrides.provenance}
          agent={claudeAgent}
        />
      </svg>,
    );
    return container;
  }

  it('sizes the main agent icon to 0.6x the avatar, every avatar size the themes ship', () => {
    // Every `avatarSize` a real `GraphTheme` uses (`graph-themes.ts`):
    // git-graph/git-extensions 16, sourcetree 18, gitkraken 24.
    for (const size of [16, 18, 24]) {
      const container = renderAvatar({ provenance: agentProvenance, cx: 40, cy: 16, size });
      const fo = container.querySelector('[data-testid="svg-agent-avatar"] foreignObject');
      expect(fo).not.toBeNull();
      const width = Number(fo?.getAttribute('width'));
      const height = Number(fo?.getAttribute('height'));
      expect(width).toBeCloseTo(size * 0.6);
      expect(height).toBeCloseTo(size * 0.6);
    }
  });

  it('centres the main agent icon exactly on the node — never floating off its own row', () => {
    const cx = 40;
    const cy = 16;
    const size = 18;
    const container = renderAvatar({ provenance: agentProvenance, cx, cy, size });
    const fo = container.querySelector('[data-testid="svg-agent-avatar"] foreignObject');
    expect(fo).not.toBeNull();
    const x = Number(fo?.getAttribute('x'));
    const y = Number(fo?.getAttribute('y'));
    const width = Number(fo?.getAttribute('width'));
    const height = Number(fo?.getAttribute('height'));

    // The foreignObject's own centre must land exactly on the node's centre
    // — the row's lane dot and avatar share this same (cx, cy).
    expect(x + width / 2).toBeCloseTo(cx);
    expect(y + height / 2).toBeCloseTo(cy);
  });

  it('never grows past the avatar circle it decorates, at any avatar size', () => {
    for (const size of [16, 18, 24]) {
      const container = renderAvatar({ provenance: agentProvenance, size });
      const fo = container.querySelector('[data-testid="svg-agent-avatar"] foreignObject');
      const width = Number(fo?.getAttribute('width'));
      const height = Number(fo?.getAttribute('height'));
      // The old bug rendered several times the avatar's own diameter; the
      // mark must stay comfortably inside it.
      expect(width).toBeLessThanOrEqual(size);
      expect(height).toBeLessThanOrEqual(size);
    }
  });

  it('sizes and centres the mixed-provenance badge the same way', () => {
    const cx = 40;
    const cy = 16;
    const size = 18;
    const radius = size / 2;
    const container = renderAvatar({ provenance: mixedProvenance, cx, cy, size });
    const fo = container.querySelector('[data-testid="svg-mixed-badge"] foreignObject');
    expect(fo).not.toBeNull();
    const x = Number(fo?.getAttribute('x'));
    const y = Number(fo?.getAttribute('y'));
    const width = Number(fo?.getAttribute('width'));
    const height = Number(fo?.getAttribute('height'));

    expect(width).toBeCloseTo(radius * 0.56);
    expect(height).toBeCloseTo(radius * 0.56);
    // Badge centre sits at the node's south-east quadrant, same as the
    // background circle it overlaps (`cx + radius*0.5`, `cy + radius*0.5`).
    expect(x + width / 2).toBeCloseTo(cx + radius * 0.5);
    expect(y + height / 2).toBeCloseTo(cy + radius * 0.5);
  });
});
