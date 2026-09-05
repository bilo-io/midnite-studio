/**
 * Wire protocol for communication with the detached session broker.
 *
 * All frames are length-prefixed:
 *   [u8 type][u32 BE payloadLength][payload]
 *
 * Types:
 *   0x00 = Control frame (JSON payload)
 *   0x01 = PTY data frame (36 ASCII bytes of ptyId + binary bytes)
 */

export const PROTOCOL = 1;
export const MAX_PAYLOAD_LENGTH = 16 * 1024 * 1024; // 16 MB

export type ControlMessage =
  // Client -> Broker requests
  | { t: 'hello'; id?: number; protocol: number; appVersion: string; pid: number; buildId?: string }
  | { t: 'list'; id?: number }
  | {
      t: 'create';
      id?: number;
      sessionId: string;
      cwd: string;
      cols: number;
      rows: number;
      env: Record<string, string>;
      initialInput?: string | undefined;
    }
  | { t: 'resize'; id?: number; ptyId: string; cols: number; rows: number }
  | { t: 'kill'; id?: number; ptyId: string }
  | { t: 'snapshot'; id?: number; sessionId: string }
  /**
   * "These sessions are gone — stop holding their scrollback." A list rather
   * than one id per message (Phase 45 Theme C): the reconciliation that finds
   * forgettable sessions runs on hydrate and on broker start/reconnect, and
   * usually finds several at once — one round trip per dead session would be
   * a chatty protocol for a socket that exists to be quiet. Distinct from
   * `kill`: a session can be forgotten long after its pty already exited.
   */
  | { t: 'forget'; id?: number; sessionIds: string[] }
  | { t: 'detach'; id?: number }
  | { t: 'flush'; id?: number }
  /**
   * Give up the socket path so a fresh broker can bind it, and move to
   * `<path>-retired-<pid>.sock` to keep serving existing sessions — the
   * handover for a broker that reports itself stale (see `staleness.ts`).
   * Replies `{ ok: true, socketPath }` with the new path.
   */
  | { t: 'retire'; id?: number }
  | { t: 'shutdown'; id?: number }
  | ControlReply
  | { t: 'exit'; ptyId: string; exitCode: number; signal?: number | undefined };

export type ControlReply =
  | { t: 'reply'; id?: number; ok: true; [key: string]: unknown }
  | {
      t: 'reply';
      id?: number;
      ok: false;
      /**
       * `stale-broker`: this broker outlived the build it was started from and
       * can no longer spawn (see `staleness.ts`). Distinct from `spawn-failed`
       * so the client can respawn a fresh broker rather than surface it.
       */
      code: 'protocol' | 'unknown-pty' | 'spawn-failed' | 'stale-broker' | 'error';
      message: string;
    };

export type Frame =
  | { type: 0x00; message: ControlMessage }
  | { type: 0x01; ptyId: string; data: Uint8Array };

export function encodeControl(msg: ControlMessage): Buffer {
  const json = JSON.stringify(msg);
  const payloadLen = Buffer.byteLength(json, 'utf8');
  if (payloadLen > MAX_PAYLOAD_LENGTH) {
    throw new Error(`Control message payload exceeds maximum size (${payloadLen} > ${MAX_PAYLOAD_LENGTH})`);
  }
  const buf = Buffer.allocUnsafe(5 + payloadLen);
  buf[0] = 0x00;
  buf.writeUInt32BE(payloadLen, 1);
  buf.write(json, 5, payloadLen, 'utf8');
  return buf;
}

/**
 * Encode an arbitrary JSON-serialisable payload as a type-0x00 (control)
 * frame — the same wire shape {@link encodeControl} writes, without narrowing
 * the payload to this module's own `ControlMessage` union. The MCP server and
 * its stdio shim (Phase 57 Themes B/C) carry `McpRequest`/`McpResponse`
 * payloads over this identical length-prefixed framing; those types have
 * nothing to do with the broker's own protocol, so forcing them through
 * `encodeControl`'s `ControlMessage` parameter would be a lie the type
 * checker only *looks* like it is catching.
 */
export function encodeJsonFrame(payload: unknown): Buffer {
  const json = JSON.stringify(payload);
  const payloadLen = Buffer.byteLength(json, 'utf8');
  if (payloadLen > MAX_PAYLOAD_LENGTH) {
    throw new Error(`Frame payload exceeds maximum size (${payloadLen} > ${MAX_PAYLOAD_LENGTH})`);
  }
  const buf = Buffer.allocUnsafe(5 + payloadLen);
  buf[0] = 0x00;
  buf.writeUInt32BE(payloadLen, 1);
  buf.write(json, 5, payloadLen, 'utf8');
  return buf;
}

export function encodeData(ptyId: string, bytes: Uint8Array): Buffer {
  // ptyId must be 36 characters (e.g. UUID)
  const idBuf = Buffer.alloc(36, 0x20); // space-pad if needed
  idBuf.write(ptyId, 0, Math.min(36, ptyId.length), 'ascii');

  const payloadLen = 36 + bytes.length;
  if (payloadLen > MAX_PAYLOAD_LENGTH) {
    throw new Error(`Data frame payload exceeds maximum size (${payloadLen} > ${MAX_PAYLOAD_LENGTH})`);
  }
  const buf = Buffer.allocUnsafe(5 + payloadLen);
  buf[0] = 0x01;
  buf.writeUInt32BE(payloadLen, 1);
  idBuf.copy(buf, 5);
  buf.set(bytes, 5 + 36);
  return buf;
}

/**
 * `maxPayloadLength` defaults to {@link MAX_PAYLOAD_LENGTH} (sized for pty
 * output) but is overridable — the MCP server (Phase 57 Theme B) passes its
 * own, three orders of magnitude smaller `MCP_MAX_REQUEST_BYTES`, since
 * nothing it serves should ever approach a pty frame's ceiling.
 */
export function createFrameDecoder(maxPayloadLength: number = MAX_PAYLOAD_LENGTH): {
  push: (chunk: Buffer) => Frame[];
  reset: () => void;
} {
  let buffer: Buffer = Buffer.alloc(0);
  /**
   * Bytes still owed to a frame whose declared length exceeded the cap.
   *
   * A caller that catches this function's throw and keeps pushing (the MCP
   * server does — Phase 57 Theme B needs the connection to survive one
   * oversized request) would otherwise have the REST of that same frame's
   * payload arrive in a later chunk and get misread as a brand-new frame's
   * header, one bogus "frame" at a time until the real bytes ran out. This
   * discards exactly the declared length, across as many `push` calls as it
   * takes, before parsing resumes — so one oversized frame produces exactly
   * one throw, not one per chunk it happened to arrive in.
   */
  let skipRemaining = 0;

  return {
    push(chunk: Buffer): Frame[] {
      if (chunk.length === 0) return [];
      buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);

      const frames: Frame[] = [];

      if (skipRemaining > 0) {
        const discard = Math.min(skipRemaining, buffer.length);
        buffer = buffer.subarray(discard);
        skipRemaining -= discard;
        if (skipRemaining > 0) return frames; // still waiting for the rest
      }

      while (buffer.length >= 5) {
        const type = buffer[0];
        const payloadLen = buffer.readUInt32BE(1);

        if (payloadLen > maxPayloadLength) {
          // Header consumed; the payload itself (whatever part of it has
          // already arrived) still needs to be skipped — set that up BEFORE
          // throwing, so the next `push` resynchronises instead of reading
          // this frame's tail as a new header.
          buffer = buffer.subarray(5);
          skipRemaining = payloadLen;
          const discard = Math.min(skipRemaining, buffer.length);
          buffer = buffer.subarray(discard);
          skipRemaining -= discard;
          throw new Error(`Frame payload length exceeds maximum (${payloadLen} > ${maxPayloadLength})`);
        }

        if (buffer.length < 5 + payloadLen) {
          break; // Need more bytes
        }

        const payload = buffer.subarray(5, 5 + payloadLen);
        buffer = buffer.subarray(5 + payloadLen);

        if (type === 0x00) {
          try {
            const parsed = JSON.parse(payload.toString('utf8')) as ControlMessage;
            frames.push({ type: 0x00, message: parsed });
          } catch (err) {
            throw new Error(`Invalid JSON in control frame: ${err instanceof Error ? err.message : String(err)}`);
          }
        } else if (type === 0x01) {
          if (payload.length < 36) {
            throw new Error(`Data frame payload too short for ptyId (${payload.length} < 36)`);
          }
          const ptyId = payload.subarray(0, 36).toString('ascii').trimEnd();
          const data = new Uint8Array(payload.subarray(36));
          frames.push({ type: 0x01, ptyId, data });
        } else {
          throw new Error(`Unknown frame type: 0x${type?.toString(16).padStart(2, '0')}`);
        }
      }

      return frames;
    },

    reset() {
      buffer = Buffer.alloc(0);
      skipRemaining = 0;
    },
  };
}
