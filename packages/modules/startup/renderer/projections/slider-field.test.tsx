// vitest/jsdom: the numeric input clamps, snaps and reverts.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SliderField, parseNumber } from './slider-field';

afterEach(cleanup);
const fmt = (v: number) => `${v} %`;
const field = (onChange = vi.fn()) => {
  render(<SliderField id="s" label="Scale" value={100} min={10} max={500} step={10} format={fmt} parse={parseNumber} onChange={onChange} />);
  return { onChange, input: screen.getByLabelText('Scale', { selector: 'input[type="text"]' }) as HTMLInputElement };
};

describe('SliderField', () => {
  it('clamps 999 to 500', () => {
    const { onChange, input } = field();
    fireEvent.change(input, { target: { value: '999' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(500);
    expect(input.value).toBe('500 %');
  });

  it('reverts text that is not a number', () => {
    const { onChange, input } = field();
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('100 %');
  });

  it('snaps 137 to 140', () => {
    const { onChange, input } = field();
    fireEvent.change(input, { target: { value: '137' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(140);
  });

  it('the range input reports each change', () => {
    const { onChange } = field();
    fireEvent.change(screen.getByRole('slider'), { target: { value: '200' } });
    expect(onChange).toHaveBeenCalledWith(200);
  });
});
