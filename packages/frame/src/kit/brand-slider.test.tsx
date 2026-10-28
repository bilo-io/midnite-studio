import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { sliderPaint } from '@bilo-io/ui';
import { BRAND_SPECTRUM, BrandSlider } from './brand-slider';

describe('BrandSlider', () => {
  it('has six brand stops that reference --rainbow-0..5', () => {
    expect(BRAND_SPECTRUM).toHaveLength(6);
    BRAND_SPECTRUM.forEach((stop, i) => expect(stop).toMatch(new RegExp(`^var\\(--rainbow-${i}, #`)));
  });

  it('paints the brand ramp by default and stays a native range', () => {
    const { container } = render(<BrandSlider aria-label="x" min={0} max={10} step={2} defaultValue={4} />);
    const input = screen.getByRole('slider', { name: 'x' }) as HTMLInputElement;
    expect(input.type).toBe('range');
    expect(input.max).toBe('10');
    const ramp = sliderPaint(BRAND_SPECTRUM).ramp;
    expect(container.innerHTML.replace(/&quot;/g, '"')).toContain('--rainbow-0');
    expect(ramp).toContain('var(--rainbow-5');
  });

  it('lets a caller override the gradient', () => {
    const { container } = render(<BrandSlider aria-label="y" gradient="red" />);
    expect(container.innerHTML).not.toContain('--rainbow-0');
  });
});
