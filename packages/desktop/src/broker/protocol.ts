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
  | { t: 'hello'; id?: number; protocol: number; appVersion: string; pid: number }
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
  | { t: 'attach'; id?: number; ptyId: string }
  | { t: 'resize'; id?: number; ptyId: string; cols: number; rows: number }
  | { t: 'kill'; id?: number; ptyId: string }
  | { t: 'snapshot'; id?: number; sessionId: string }
  | { t: 'detach'; id?: number }
  | { t: 'flush'; id?: number }
  | { t: 'shutdown'; id?: number }
  | ControlReply
  | { t: 'exit'; ptyId: string; exitCode: number; signal?: number | undefined };

export type ControlReply =
  | { t: 'reply'; id?: number; ok: true; [key: string]: unknown }
  | {
      t: 'reply';
      id?: number;
      ok: false;
      code: 'protocol' | 'unknown-pty' | 'spawn-failed' | 'error';
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

export function createFrameDecoder(): {
  push: (chunk: Buffer) => Frame[];
  reset: () => void;
} {
  let buffer: Buffer = Buffer.alloc(0);

  return {
    push(chunk: Buffer): Frame[] {
      if (chunk.length === 0) return [];
      buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);

      const frames: Frame[] = [];

      while (buffer.length >= 5) {
        const type = buffer[0];
        const payloadLen = buffer.readUInt32BE(1);

        if (payloadLen > MAX_PAYLOAD_LENGTH) {
          buffer = Buffer.alloc(0);
          throw new Error(`Frame payload length exceeds maximum (${payloadLen} > ${MAX_PAYLOAD_LENGTH})`);
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
    },
  };
}
