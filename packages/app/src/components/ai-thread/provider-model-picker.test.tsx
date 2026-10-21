import { DEFAULT_IMAGE_PROVIDER, imageModelsFor } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SiGooglegemini, SiOllama } from 'react-icons/si';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { imagePickerProviders } from '../../features/media/image/create-panel';
import { filterPickerItems, ProviderModelPicker, type PickerProvider } from './provider-model-picker';

/** vitest/jsdom: the composer's provider + model picker. */

afterEach(cleanup);

const providers: PickerProvider[] = [
  { id: 'a', label: 'Alpha', icon: SiGooglegemini, color: '#ff0000', recommended: true },
  { id: 'b', label: 'Beta', icon: SiOllama, color: '#00ff00' },
];
const models = [
  { id: 'm1', label: 'Model One', recommended: true },
  { id: 'm2', label: 'Model Two' },
];

function setup(overrides: Partial<Parameters<typeof ProviderModelPicker>[0]> = {}) {
  const onProviderChange = vi.fn();
  const onModelChange = vi.fn();
  render(
    <ProviderModelPicker
      providers={providers}
      provider="a"
      onProviderChange={onProviderChange}
      models={models}
      model="m1"
      onModelChange={onModelChange}
      {...overrides}
    />,
  );
  return { onProviderChange, onModelChange };
}

describe('filterPickerItems', () => {
  it('filters case-insensitively by label or id and returns all for a blank query', () => {
    expect(filterPickerItems(models, 'TWO').map((m) => m.id)).toEqual(['m2']);
    expect(filterPickerItems(models, 'm1').map((m) => m.id)).toEqual(['m1']);
    expect(filterPickerItems(models, '  ')).toHaveLength(2);
  });
});

describe('ProviderModelPicker', () => {
  it('searches providers and selects one', () => {
    const { onProviderChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Provider: Alpha' }));
    fireEvent.change(screen.getByLabelText('Search providers'), { target: { value: 'bet' } });
    expect(screen.queryByRole('option', { name: /Alpha/ })).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: /Beta/ }));
    expect(onProviderChange).toHaveBeenCalledWith('b');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('searches models, shows no-match state and selects one', () => {
    const { onModelChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Model: Model One' }));
    fireEvent.change(screen.getByLabelText('Search models'), { target: { value: 'zzz' } });
    expect(screen.getByText('No matches')).not.toBeNull();
    fireEvent.change(screen.getByLabelText('Search models'), { target: { value: 'two' } });
    fireEvent.click(screen.getByRole('option', { name: /Model Two/ }));
    expect(onModelChange).toHaveBeenCalledWith('m2');
  });

  it('colours only the selected provider icon', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Provider: Alpha' }));
    const selectedGlyph = screen.getAllByTestId('provider-glyph-a').at(-1)!;
    const otherGlyph = screen.getByTestId('provider-glyph-b');
    expect(selectedGlyph.getAttribute('data-selected')).toBe('true');
    expect((selectedGlyph.firstElementChild as HTMLElement).style.color).not.toBe('');
    expect(otherGlyph.getAttribute('data-selected')).toBe('false');
    expect((otherGlyph.firstElementChild as HTMLElement).style.color).toBe('');
    expect(otherGlyph.firstElementChild?.getAttribute('class')).toContain('text-muted-foreground');
  });

  it('marks the recommended entries and disables blocked providers', () => {
    const onProviderChange = vi.fn();
    setup({
      onProviderChange,
      providers: [...providers, { id: 'c', label: 'Gamma', icon: SiOllama, disabled: true, reason: 'No key' }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Provider: Alpha' }));
    expect(screen.getByRole('option', { name: /Alpha/ }).textContent).toContain('Recommended');
    const gamma = screen.getByRole('option', { name: /Gamma/ }) as HTMLButtonElement;
    expect(gamma.disabled).toBe(true);
    fireEvent.click(gamma);
    expect(onProviderChange).not.toHaveBeenCalled();
  });

  it('hides the model picker when the provider has no models', () => {
    setup({ models: [] });
    expect(screen.queryByRole('button', { name: /^Model:/ })).toBeNull();
  });
});

describe('image recommended default', () => {
  it('defaults to Antigravity with Gemini 2.5 Flash Image, flagged recommended', () => {
    expect(DEFAULT_IMAGE_PROVIDER).toBe('agy');
    expect(imageModelsFor('agy')[0]?.label).toBe('Gemini 2.5 Flash Image');
    const rows = imagePickerProviders([]);
    expect(rows.filter((r) => r.recommended).map((r) => r.id)).toEqual(['agy']);
  });
});
