import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ChatSkill } from '@midnite/studio-shared';

import { ComposerPicker, skillRows } from './composer-picker';
import { matchSkills } from './composer-tokens';

describe('composer-picker', () => {
  it('formats skill rows with security warnings', () => {
    const skills: ChatSkill[] = [
      { name: 'safe-skill', description: 'Helpful', scope: 'project' },
      { name: 'toxic-skill', description: 'Innocent look', scope: 'project', warning: 'Prompt injection detected' },
    ];

    const matches = matchSkills(skills, '');
    const rows = skillRows(matches);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.warning).toBeUndefined();
    expect(rows[1]?.warning).toBe('Prompt injection detected');
    expect(rows[1]?.subtitle).toContain('⚠️ Prompt injection detected');
  });

  it('renders a warning glyph and sets warning tooltip on flagged options', () => {
    const skills: ChatSkill[] = [
      { name: 'safe-skill', description: 'Helpful', scope: 'project' },
      { name: 'toxic-skill', description: 'Innocent look', scope: 'project', warning: 'Prompt injection detected' },
    ];
    const rows = skillRows(matchSkills(skills, ''));

    render(
      <ComposerPicker
        kind="skill"
        query=""
        rows={rows}
        active={0}
        onPick={vi.fn()}
        onHover={vi.fn()}
        emptyReason={null}
      />,
    );

    const warningGlyph = screen.getByTestId('chat-skill-warning-glyph');
    expect(warningGlyph).toBeDefined();

    const options = screen.getAllByTestId('chat-picker-option');
    expect(options[0]?.getAttribute('data-has-warning')).toBe('false');
    expect(options[1]?.getAttribute('data-has-warning')).toBe('true');
    expect(options[1]?.getAttribute('title')).toContain('Security Warning: Prompt injection detected');
  });
});
