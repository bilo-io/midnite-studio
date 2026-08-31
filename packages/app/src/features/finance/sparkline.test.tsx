import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Sparkline } from './sparkline';

describe('Sparkline', () => {
  it('renders nothing when points are fewer than 2', () => {
    const { container } = render(<Sparkline points={[{ t: 1, c: 100 }]} up={true} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders svg with currentColor stroke and fill so it inherits surrounding text color', () => {
    const points = [
      { t: 1, c: 100 },
      { t: 2, c: 150 },
      { t: 3, c: 200 },
    ];
    const { container } = render(
      <div className="text-emerald-600">
        <Sparkline points={points} up={true} width={40} height={20} />
      </div>,
    );

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();

    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(2);

    const [areaPath, linePath] = Array.from(paths);
    expect(areaPath).toBeDefined();
    expect(linePath).toBeDefined();
    expect(areaPath?.getAttribute('fill')).toBe('currentColor');
    expect(areaPath?.getAttribute('fill-opacity')).toBe('0.22');
    expect(linePath?.getAttribute('stroke')).toBe('currentColor');
    expect(linePath?.getAttribute('fill')).toBe('none');
  });
});
