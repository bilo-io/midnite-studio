import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { GrokIcon } from './grok-icon';

describe('GrokIcon', () => {
  afterEach(cleanup);

  it('renders an SVG with viewBox 0 0 24 24 and currentColor fill', () => {
    const { container } = render(<GrokIcon className="size-4" />);
    const svg = container.querySelector('svg');

    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg?.getAttribute('fill')).toBe('currentColor');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');
    expect(svg?.getAttribute('class')).toBe('size-4');
  });

  it('contains a path with fill-rule="evenodd" for the circle and cutouts', () => {
    const { container } = render(<GrokIcon />);
    const path = container.querySelector('path');

    expect(path).not.toBeNull();
    expect(path?.getAttribute('fill-rule')).toBe('evenodd');
  });

  it('strips color from style so the mark always preserves the ambient text color', () => {
    const { container } = render(
      <GrokIcon style={{ color: '#000000', opacity: 0.75 } as React.CSSProperties} />,
    );
    const svg = container.querySelector('svg');

    // Style must keep non-color properties (opacity) but discard color
    expect(svg?.style.opacity).toBe('0.75');
    expect(svg?.style.color).toBe('');
  });
});
