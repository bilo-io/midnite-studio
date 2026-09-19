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
    email?: string;
    name?: string;
  }) {
    const { cx = 40, cy = 16, size = 18, email = 'claude@example.com', name = 'Claude' } =
      overrides;
    const { container } = render(
      <svg>
        <CommitAvatar
          email={email}
          name={name}
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

  /*
   * `agent` and `mixed` share the exact same corner-badge geometry (ad hoc
   * follow-up to Phase 78 Theme C): the human avatar is the node's face in
   * both, and the agent glyph sits in a small badge over its south-east
   * quadrant rather than replacing the face at full node size. What used to
   * be `agent`'s own 0.6x-of-the-node, dead-centred icon is gone — these
   * cases are checked together below.
   */
  it.each([
    ['agent', 'svg-agent-avatar', agentProvenance],
    ['mixed', 'svg-mixed-badge', mixedProvenance],
  ] as const)(
    'sizes the %s badge icon to 0.56x the badge radius, every avatar size the themes ship',
    (_label, testId, provenance) => {
      // Every `avatarSize` a real `GraphTheme` uses (`graph-themes.ts`):
      // git-graph/git-extensions 16, sourcetree 18, gitkraken 24.
      for (const size of [16, 18, 24]) {
        const radius = size / 2;
        const container = renderAvatar({ provenance, cx: 40, cy: 16, size });
        const fo = container.querySelector(`[data-testid="${testId}"] foreignObject`);
        expect(fo).not.toBeNull();
        const width = Number(fo?.getAttribute('width'));
        const height = Number(fo?.getAttribute('height'));
        expect(width).toBeCloseTo(radius * 0.56);
        expect(height).toBeCloseTo(radius * 0.56);
      }
    },
  );

  it.each([
    ['agent', 'svg-agent-avatar', agentProvenance],
    ['mixed', 'svg-mixed-badge', mixedProvenance],
  ] as const)(
    'centres the %s badge over the node’s south-east quadrant, never floating off its own row',
    (_label, testId, provenance) => {
      const cx = 40;
      const cy = 16;
      const size = 18;
      const radius = size / 2;
      const container = renderAvatar({ provenance, cx, cy, size });
      const fo = container.querySelector(`[data-testid="${testId}"] foreignObject`);
      expect(fo).not.toBeNull();
      const x = Number(fo?.getAttribute('x'));
      const y = Number(fo?.getAttribute('y'));
      const width = Number(fo?.getAttribute('width'));
      const height = Number(fo?.getAttribute('height'));

      // Badge centre sits at the node's south-east quadrant, same as the
      // background circle it overlaps (`cx + radius*0.5`, `cy + radius*0.5`).
      expect(x + width / 2).toBeCloseTo(cx + radius * 0.5);
      expect(y + height / 2).toBeCloseTo(cy + radius * 0.5);
    },
  );

  it.each([
    ['agent', 'svg-agent-avatar', agentProvenance],
    ['mixed', 'svg-mixed-badge', mixedProvenance],
  ] as const)(
    'never grows the %s badge past the avatar circle it decorates, at any avatar size',
    (_label, testId, provenance) => {
      for (const size of [16, 18, 24]) {
        const container = renderAvatar({ provenance, size });
        const fo = container.querySelector(`[data-testid="${testId}"] foreignObject`);
        const width = Number(fo?.getAttribute('width'));
        const height = Number(fo?.getAttribute('height'));
        // The old bug rendered several times the avatar's own diameter; the
        // mark must stay comfortably inside it.
        expect(width).toBeLessThanOrEqual(size);
        expect(height).toBeLessThanOrEqual(size);
      }
    },
  );

  describe('the human avatar is augmented, never replaced', () => {
    it('an agent commit renders both the human avatar face and the agent badge', () => {
      // A fresh, unused email so the avatar-cache module (shared across every
      // test in this file) is guaranteed to still be in its synchronous
      // 'pending' state — showing generated initials — when this assertion runs.
      const container = renderAvatar({
        provenance: { kind: 'agent', source: 'author', agentIds: ['claude'] },
        email: 'agent-augment-test@example.com',
        name: 'Ada Lovelace',
        cx: 40,
        cy: 16,
        size: 18,
      });

      // The human face is still drawn: the hue-fill circle plus its
      // generated-initials fallback, not the old agent-tinted replacement
      // circle that used to stand in for it.
      const svg = container.querySelector('svg');
      expect(svg?.querySelectorAll('circle').length).toBeGreaterThanOrEqual(2);
      expect(container.querySelector('text')?.textContent).toBe('AL');

      // ...and the agent badge is drawn alongside it, distinctly testable
      // from the `mixed` case.
      const badge = container.querySelector('[data-testid="svg-agent-avatar"]');
      expect(badge).not.toBeNull();
      expect(container.querySelector('[data-testid="svg-mixed-badge"]')).toBeNull();
      expect(badge?.querySelector('foreignObject svg')).not.toBeNull();
    });

    it('a mixed commit renders both the human avatar face and the mixed badge', () => {
      const container = renderAvatar({
        provenance: mixedProvenance,
        email: 'mixed-augment-test@example.com',
        name: 'Bob Newhart',
        cx: 40,
        cy: 16,
        size: 18,
      });

      const svg = container.querySelector('svg');
      expect(svg?.querySelectorAll('circle').length).toBeGreaterThanOrEqual(2);
      expect(container.querySelector('text')?.textContent).toBe('BN');

      const badge = container.querySelector('[data-testid="svg-mixed-badge"]');
      expect(badge).not.toBeNull();
      expect(container.querySelector('[data-testid="svg-agent-avatar"]')).toBeNull();
    });

    it("tints the agent badge with the agent's own accent; the mixed badge stays neutral", () => {
      const agentContainer = renderAvatar({
        provenance: { kind: 'agent', source: 'author', agentIds: ['claude'] },
        cx: 40,
        cy: 16,
        size: 18,
      });
      const agentBadgeCircle = agentContainer.querySelector(
        '[data-testid="svg-agent-avatar"] circle',
      );
      expect(agentBadgeCircle?.getAttribute('fill')).toBe(`${claudeAgent.accent}25`);
      expect(agentBadgeCircle?.getAttribute('stroke')).toBe(claudeAgent.accent);

      const mixedContainer = renderAvatar({ provenance: mixedProvenance, cx: 40, cy: 16, size: 18 });
      const mixedBadgeCircle = mixedContainer.querySelector(
        '[data-testid="svg-mixed-badge"] circle',
      );
      expect(mixedBadgeCircle?.getAttribute('fill')).toBe('hsl(var(--background))');
      expect(mixedBadgeCircle?.getAttribute('stroke')).not.toBe(claudeAgent.accent);
    });
  });
});
