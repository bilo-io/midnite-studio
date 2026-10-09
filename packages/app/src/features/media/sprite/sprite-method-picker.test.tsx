import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { recommendSpriteMethod, type SpriteMethod } from '@midnite/studio-shared';

import { SpriteMethodPicker } from './sprite-method-picker';

afterEach(cleanup);

function Harness({ initial, perspective = 'side', directions = 1 }: { initial: SpriteMethod; perspective?: 'side' | 'top-down'; directions?: 1 | 4 | 8 }) {
  const [method, setMethod] = useState<SpriteMethod>(initial);
  const recommended = recommendSpriteMethod({ targetPerspective: perspective, directions, style: 'pixel' });
  return (
    <>
      <SpriteMethodPicker method={method} onMethod={setMethod} recommended={recommended} />
      <output data-testid="method">{method}</output>
    </>
  );
}

const card = (name: string) => screen.getByRole('radio', { name: new RegExp(name) });

describe('SpriteMethodPicker', () => {
  it('puts the Recommended badge and reason on the card recommendSpriteMethod names', () => {
    render(<Harness initial="hand-drawn" />);
    expect(within(card('Hand-drawn')).getByTestId('method-recommended').textContent).toBe('Recommended');
    expect(within(card('Rendered from 3D')).queryByTestId('method-recommended')).toBeNull();
    expect(screen.getByText('Side-scrollers need one facing; hand-drawn frames look best.')).toBeTruthy();
  });

  it('moves the badge to Rendered from 3D for a top-down, four-direction sheet', () => {
    render(<Harness initial="rendered" perspective="top-down" directions={4} />);
    expect(within(card('Rendered from 3D')).getByTestId('method-recommended')).toBeTruthy();
    expect(within(card('Hand-drawn')).queryByTestId('method-recommended')).toBeNull();
  });

  it('ticking one-shot sets the method and dims the cards; unticking restores the previous card', () => {
    render(<Harness initial="hand-drawn" />);
    fireEvent.click(card('Rendered from 3D'));
    expect(screen.getByTestId('method').textContent).toBe('rendered');
    const box = screen.getByRole('checkbox', { name: /whole sheet in one image/ });
    fireEvent.click(box);
    expect(screen.getByTestId('method').textContent).toBe('one-shot');
    expect(screen.getByRole('radiogroup', { name: 'Method' }).className).toContain('opacity-50');
    fireEvent.click(box);
    expect(screen.getByTestId('method').textContent).toBe('rendered');
  });

  it('moves between the cards with the arrow keys', () => {
    render(<Harness initial="hand-drawn" />);
    fireEvent.keyDown(card('Hand-drawn'), { key: 'ArrowRight' });
    expect(screen.getByTestId('method').textContent).toBe('rendered');
  });
});
