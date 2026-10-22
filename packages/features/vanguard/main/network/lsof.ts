/**
 * `lsof -i -nP -F pcnPT`: the connection snapshot's wire format (Phase 120 Theme E). Pure, so a fixture
 * of real output tests it under bare vitest.
 *
 * `-F` prints one field per line, the first character naming it: `p` starts a process set (`p<pid>`,
 * then `c<command>`), `f` starts one open file in it, and `n` (name), `P` (protocol) and `T` (TCP info,
 * `TST=ESTABLISHED`, `TQR=0`, ...) belong to the file before the next `f`. Without `-0` the line break is
 * the delimiter, so a name that holds a space is safe. A network file's name reads
 * `127.0.0.1:50000->93.184.216.34:443`, `[fe80::1]:5000->[2606:4700::1111]:443`, `*:8080` (a listener) or
 * `*:*` (an unconnected UDP socket); `-P` keeps ports numeric and `-n` keeps hosts numeric.
 */

/** The argument vector the sensor runs. */
export const LSOF_ARGS: readonly string[] = ['-i', '-nP', '-F', 'pcnPT'];

export interface LsofEndpoint {
  host: string;
  port: number;
}

export interface LsofConnection {
  pid: number;
  command: string;
  /** `TCP` or `UDP`, as lsof prints it. */
  protocol: string;
  local: LsofEndpoint | null;
  /** `null` for a listener or an unconnected UDP socket: nothing has left this machine. */
  remote: LsofEndpoint | null;
  /** `TST=` from the T field (`ESTABLISHED`, `LISTEN`, `SYN_SENT`, ...). */
  state?: string;
}

/** `[2606:4700::1111]:443` → `{host: '2606:4700::1111', port: 443}`; `1.2.3.4:80`; `*:*` and `*:8080` are `null`-hosted. */
export function parseEndpoint(text: string): LsofEndpoint | null {
  const bracketed = /^\[([^\]]+)\]:(\d+)$/.exec(text);
  if (bracketed) return { host: bracketed[1]!, port: Number(bracketed[2]) };
  const plain = /^([^:\s]+):(\d+)$/.exec(text);
  if (plain) return plain[1] === '*' ? null : { host: plain[1]!, port: Number(plain[2]) };
  return null;
}

/** A file set's `n` field: `local->remote`, or a lone local endpoint (a listener). */
export function parseName(name: string): { local: LsofEndpoint | null; remote: LsofEndpoint | null } {
  const arrow = name.indexOf('->');
  if (arrow < 0) return { local: parseEndpoint(name), remote: null };
  return { local: parseEndpoint(name.slice(0, arrow)), remote: parseEndpoint(name.slice(arrow + 2)) };
}

interface Partial {
  name?: string;
  protocol?: string;
  state?: string;
}

/** Every network file in the output, with the process it belongs to. A malformed line is skipped. */
export function parseLsof(output: string): LsofConnection[] {
  const out: LsofConnection[] = [];
  let pid: number | null = null;
  let command = '';
  let file: Partial | null = null;

  const flush = (): void => {
    if (file !== null && pid !== null && file.name !== undefined && file.protocol !== undefined) {
      const { local, remote } = parseName(file.name);
      out.push({
        pid,
        command,
        protocol: file.protocol,
        local,
        remote,
        ...(file.state !== undefined ? { state: file.state } : {}),
      });
    }
    file = null;
  };

  for (const line of output.split('\n')) {
    if (line === '') continue;
    const tag = line[0];
    const value = line.slice(1);
    switch (tag) {
      case 'p': {
        flush();
        const parsed = Number(value);
        pid = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
        command = '';
        break;
      }
      case 'c':
        command = value;
        break;
      case 'f':
        flush();
        file = {};
        break;
      // `f` is not among the requested fields, so nothing marks where one file's fields end and the next
      // file's begin except a field that repeats: a second `n`, `P` or `ST=` opens a new file, whatever
      // order lsof emitted them in.
      case 'n':
        if (file?.name !== undefined) flush();
        file ??= {};
        file.name = value;
        break;
      case 'P':
        if (file?.protocol !== undefined) flush();
        file ??= {};
        file.protocol = value;
        break;
      case 'T': {
        const state = /^ST=(.+)$/.exec(value);
        if (state) {
          if (file?.state !== undefined) flush();
          file ??= {};
          file.state = state[1]!;
        }
        break;
      }
      default:
        break;
    }
  }
  flush();
  return out;
}
