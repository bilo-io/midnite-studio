// vitest/jsdom: the sheet shows the proposal as editable fields and the findings, and confirms the edited manifest.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GameDiagnosis, GameManifest } from '@midnite/studio-shared';

import { AdoptGameSheet } from './adopt-game-sheet';

afterEach(cleanup);

const proposed = {
  version: 1,
  name: 'Synth Surf',
  engine: 'three',
  dimension: '3d',
  perspective: 'third-person',
  genre: null,
  starter: 'custom',
  cameraPresets: [],
  entry: 'index.html',
  kitVersion: '0.0.0',
  vendored: { three: '0.185.1' },
  assets: [],
  network: 'off',
  deterministic: false,
  keepSaveData: false,
  build: { command: 'npm run build', out: 'dist' },
} as unknown as GameManifest;

const diagnosis: GameDiagnosis = {
  path: '/g/synth',
  hasManifest: false,
  findings: [{ rule: 'manifest.missing', level: 'error', area: 'manifest', message: 'No midnite-game.json at the game\'s root.', path: 'midnite-game.json', fixId: 'write-manifest' }],
  counts: { error: 1, warn: 0, info: 0 },
  status: 'error',
};

function open(onConfirm = vi.fn(), onCancel = vi.fn()) {
  render(<AdoptGameSheet path="/g/synth" proposed={proposed} diagnosis={diagnosis} onCancel={onCancel} onConfirm={onConfirm} />);
  return { onConfirm, onCancel };
}

describe('AdoptGameSheet (Phase 149 Theme F)', () => {
  it('shows the proposal and the findings', () => {
    open();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Synth Surf');
    expect(screen.getByText('three.js')).toBeTruthy();
    expect(screen.getByText('3D')).toBeTruthy();
    expect((screen.getByLabelText('Build command') as HTMLInputElement).value).toBe('npm run build');
    expect((screen.getByLabelText('Genre') as HTMLSelectElement).value).toBe('');
    expect(screen.getByText(/No midnite-game.json at the game/)).toBeTruthy();
  });

  it('confirms the edited manifest, keeping every other key', () => {
    const { onConfirm } = open();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Synth Surf 2 ' } });
    fireEvent.change(screen.getByLabelText('Genre'), { target: { value: 'racing' } });
    fireEvent.change(screen.getByLabelText('Perspective'), { target: { value: 'first-person' } });
    fireEvent.click(screen.getByRole('button', { name: 'Write manifest and add' }));
    expect(onConfirm).toHaveBeenCalledWith({ ...proposed, name: 'Synth Surf 2', genre: 'racing', perspective: 'first-person' });
  });

  it('drops the build block when the command is cleared, and blocks an empty name', () => {
    const { onConfirm } = open();
    fireEvent.change(screen.getByLabelText('Build command'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Write manifest and add' }));
    const sent = onConfirm.mock.calls[0]?.[0] as GameManifest;
    expect(sent.build).toBeUndefined();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  ' } });
    expect((screen.getByRole('button', { name: 'Write manifest and add' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('cancels from the button and from Escape', () => {
    const { onCancel } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
