import { SF3D_OPTION_DEFAULTS } from '@midnite/studio-shared';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SF3D_SETTINGS_DEFAULT, Sf3dSettings, type Sf3dSettingsValue } from './sf3d-settings';
import { render } from './test-render';

/** vitest/jsdom: the SF3D settings form — plain DOM controls over one value, and the suffix line they drive. */
afterEach(cleanup);

function Harness({ onValue, disabled = false }: { onValue: (v: Sf3dSettingsValue) => void; disabled?: boolean }) {
  const [value, setValue] = useState(SF3D_SETTINGS_DEFAULT);
  return (
    <Sf3dSettings
      value={value}
      placeholderName="mug"
      disabled={disabled}
      onChange={(next) => {
        setValue(next);
        onValue(next);
      }}
    />
  );
}

const commitNumber = (label: string, value: string) => {
  const input = screen.getByRole('spinbutton', { name: label });
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};

describe('Sf3dSettings', () => {
  it('starts at the defaults with no suffix and nothing to reset', () => {
    render(<Harness onValue={() => undefined} />);
    expect(screen.getByTestId('sf3d-suffix').textContent).toBe('Default settings — no file-name suffix');
    expect((screen.getByTestId('sf3d-settings-reset') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('radio', { name: '1024' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Model name') as HTMLInputElement).placeholder).toBe('mug');
    expect(screen.queryByRole('spinbutton', { name: 'Tolerance' })).toBeNull();
  });

  it('sets every option, shows the suffix it adds, and resets to the defaults but keeps the name', () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    fireEvent.change(screen.getByLabelText('Model name'), { target: { value: 'TM Uniform' } });
    fireEvent.click(screen.getByRole('radio', { name: '2048' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Remove background' }));
    commitNumber('Tolerance', '40');
    commitNumber('Fill %', '90');
    commitNumber('Threshold', '8');
    commitNumber('Deformation', '200');
    commitNumber('Roughness', '0.3');
    commitNumber('Metalness', '0.5');
    commitNumber('Camera distance', '2');
    commitNumber('Field of view °', '30');
    commitNumber('Decode batch', '65536');

    expect(onValue.mock.lastCall![0]).toEqual({
      name: 'TM Uniform',
      textureSize: 2048,
      options: { removeBackground: true, backgroundTolerance: 40, foregroundRatio: 0.9, threshold: 8, resolution: 200, roughness: 0.3, metalness: 0.5, cameraDistance: 2, fov: 30, decodeBatch: 65_536 },
    });
    expect(screen.getByTestId('sf3d-suffix').textContent).toBe('File name adds -tex2048-bg40-fg90-th8-def200-rough30-metal50-cam200-fov30');

    fireEvent.click(screen.getByTestId('sf3d-settings-reset'));
    expect(onValue.mock.lastCall![0]).toEqual({ name: 'TM Uniform', textureSize: 1024, options: SF3D_OPTION_DEFAULTS });
  });

  it('clamps a typed value to the range', () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    commitNumber('Threshold', '99');
    expect(onValue.mock.lastCall![0].options.threshold).toBe(40);
  });

  it('locks every control while a generation runs', () => {
    render(<Harness onValue={() => undefined} disabled />);
    expect((screen.getByTestId('sf3d-settings') as HTMLFieldSetElement).disabled).toBe(true);
  });
});
