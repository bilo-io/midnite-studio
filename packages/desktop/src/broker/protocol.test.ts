import { describe, expect, it } from 'vitest';

import {
  createFrameDecoder,
  encodeControl,
  encodeData,
  encodeJsonFrame,
  MAX_PAYLOAD_LENGTH,
  PROTOCOL,
  type ControlMessage,
} from './protocol';

describe('protocol codec', () => {
  it('encodes and decodes a control frame', () => {
    const decoder = createFrameDecoder();
    const msg: ControlMessage = {
      t: 'hello',
      id: 1,
      protocol: PROTOCOL,
      appVersion: '0.12.0',
      pid: 12345,
    };

    const encoded = encodeControl(msg);
    const frames = decoder.push(encoded);

    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({
      type: 0x00,
      message: msg,
    });
  });

  it('decodes a control frame split across three pushes', () => {
    const decoder = createFrameDecoder();
    const msg: ControlMessage = {
      t: 'create',
      id: 42,
      sessionId: 'sess-1234',
      cwd: '/path/to/repo',
      cols: 120,
      rows: 40,
      env: { FOO: 'bar' },
    };

    const encoded = encodeControl(msg);
    const part1 = encoded.subarray(0, 2);
    const part2 = encoded.subarray(2, 10);
    const part3 = encoded.subarray(10);

    expect(decoder.push(part1)).toEqual([]);
    expect(decoder.push(part2)).toEqual([]);
    const frames = decoder.push(part3);

    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({
      type: 0x00,
      message: msg,
    });
  });

  it('decodes multiple coalesced frames in one chunk', () => {
    const decoder = createFrameDecoder();
    const msg1: ControlMessage = { t: 'list', id: 1 };
    const msg2: ControlMessage = { t: 'detach', id: 2 };
    const dataMsg = new Uint8Array([1, 2, 3, 4, 5]);
    const ptyId = '12345678-1234-1234-1234-123456789abc';

    const chunk = Buffer.concat([
      encodeControl(msg1),
      encodeData(ptyId, dataMsg),
      encodeControl(msg2),
    ]);

    const frames = decoder.push(chunk);
    expect(frames).toHaveLength(3);
    expect(frames[0]).toEqual({ type: 0x00, message: msg1 });
    expect(frames[1]).toEqual({ type: 0x01, ptyId, data: dataMsg });
    expect(frames[2]).toEqual({ type: 0x00, message: msg2 });
  });

  it('round-trips pty data with 36-byte ptyId', () => {
    const decoder = createFrameDecoder();
    const ptyId = 'abcdef01-2345-6789-abcd-ef0123456789';
    const payload = new Uint8Array([0x1b, 0x5b, 0x33, 0x31, 0x6d, 0x48, 0x69]); // \x1b[31mHi

    const encoded = encodeData(ptyId, payload);
    const frames = decoder.push(encoded);

    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({
      type: 0x01,
      ptyId,
      data: payload,
    });
  });

  it('rejects payloadLength larger than 16 MB', () => {
    const decoder = createFrameDecoder();
    const badHeader = Buffer.alloc(5);
    badHeader[0] = 0x00;
    badHeader.writeUInt32BE(MAX_PAYLOAD_LENGTH + 1, 1);

    expect(() => decoder.push(badHeader)).toThrow(/exceeds maximum/i);
  });

  it('honours a caller-supplied cap smaller than the pty default', () => {
    const decoder = createFrameDecoder(10);
    const badHeader = Buffer.alloc(5);
    badHeader[0] = 0x00;
    badHeader.writeUInt32BE(11, 1);

    expect(() => decoder.push(badHeader)).toThrow(/exceeds maximum \(11 > 10\)/i);
  });

  it('resynchronises after an oversized frame split across many pushes, throwing once', () => {
    // A real oversized-but-well-formed frame: the declared length and the
    // actual body agree, and the whole thing arrives in small chunks — the
    // shape a genuinely too-large MCP request takes over a real socket,
    // where the OS delivers it across many `data` events rather than one.
    const decoder = createFrameDecoder(10);
    const oversized = encodeJsonFrame({ big: 'x'.repeat(50) });
    expect(oversized.length).toBeGreaterThan(15);

    let threwOnFirstChunk = false;
    for (let offset = 0; offset < oversized.length; offset += 3) {
      const chunk = oversized.subarray(offset, offset + 3);
      try {
        const frames = decoder.push(chunk);
        expect(frames).toEqual([]);
      } catch (err) {
        expect(offset).toBeLessThanOrEqual(5); // only the header-completing push throws
        expect(threwOnFirstChunk).toBe(false); // exactly once across the whole stream
        expect((err as Error).message).toMatch(/exceeds maximum/i);
        threwOnFirstChunk = true;
      }
    }
    expect(threwOnFirstChunk).toBe(true);

    // The connection resynchronises: a well-formed, in-cap frame right after
    // the oversized one's tail decodes cleanly.
    const next = encodeJsonFrame({ a: 1 });
    const frames = decoder.push(next);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({ type: 0x00, message: { a: 1 } });
  });
});
