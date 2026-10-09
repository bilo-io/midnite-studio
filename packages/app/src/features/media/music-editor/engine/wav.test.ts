import { describe, expect, it } from 'vitest';

import { encodeWav } from './wav';

describe('encodeWav', () => {
  it('writes a valid 16-bit PCM header and clamped samples', () => {
    const bytes = encodeWav([new Float32Array([0, 1, -1, 2]), new Float32Array([0, 0, 0, 0])], 44100);
    const view = new DataView(bytes.buffer);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(40, true)).toBe(4 * 2 * 2);
    expect(bytes.length).toBe(44 + 16);
    expect(view.getInt16(44 + 4, true)).toBe(32767);
    expect(view.getInt16(44 + 8, true)).toBe(-32768);
    expect(view.getInt16(44 + 12, true)).toBe(32767);
  });
});
