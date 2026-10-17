// A stand-in agent CLI for `agent-loop.test.ts` — never a real Claude Code or Codex. It reads the run's MCP
// server out of its argv the way each CLI would (Claude: `--mcp-config <json>`; Codex: `-c mcp_servers.*`),
// spawns the shim that config names, speaks MCP JSON-RPC to it over stdio, edits one file in its cwd (the
// game repo) and prints a closing sentence. A prompt containing HANG instead parks it, with a grandchild,
// until it is killed. Everything it saw is written beside the repo (`<repo>.agent.json`) for the test.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const argv = process.argv.slice(2);
const cwd = process.cwd();
const out = join(dirname(cwd), `${basename(cwd)}.agent.json`);
const seen = { argv, pid: process.pid, cwd, calls: [] };
const save = () => writeFileSync(out, JSON.stringify(seen, null, 2));

function serverFromArgv() {
  const at = argv.indexOf('--mcp-config');
  if (at >= 0) {
    const servers = JSON.parse(argv[at + 1]).mcpServers;
    seen.servers = Object.keys(servers);
    return servers.midnite;
  }
  const value = (key) => argv.find((a) => a.startsWith(`mcp_servers.midnite.${key}=`))?.slice(`mcp_servers.midnite.${key}=`.length);
  const env = Object.fromEntries([...(value('env') ?? '').matchAll(/(\w+) = ("[^"]*")/g)].map((m) => [m[1], JSON.parse(m[2])]));
  seen.servers = ['midnite'];
  return { command: JSON.parse(value('command')), args: JSON.parse(value('args')), env };
}

const server = serverFromArgv();
seen.shim = server;
const shim = spawn(server.command, server.args, { env: { ...process.env, ...server.env }, stdio: ['pipe', 'pipe', 'ignore'] });
seen.shimPid = shim.pid;
save();

let buffer = '';
const waiting = new Map();
shim.stdout.setEncoding('utf8');
shim.stdout.on('data', (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const message = JSON.parse(buffer.slice(0, nl));
    buffer = buffer.slice(nl + 1);
    waiting.get(message.id)?.(message);
  }
});
let nextId = 1;
const rpc = (method, params) =>
  new Promise((resolve) => {
    const id = nextId++;
    waiting.set(id, resolve);
    shim.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });

const gameId = /gameId "([^"]+)"/.exec(argv.join(' '))?.[1];
await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'fake-agent', version: '0' } });
shim.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
seen.tools = (await rpc('tools/list', {})).result.tools.map((t) => t.name);
const call = async (name, args) => {
  const reply = await rpc('tools/call', { name, arguments: args });
  seen.calls.push({ name, isError: reply.result?.isError === true, types: reply.result?.content.map((c) => c.type), text: reply.result?.content.find((c) => c.type === 'text')?.text });
  save();
};
await call('game_run', { game: gameId });
await call('game_screenshot', { game: gameId });
await call('game_logs', { game: gameId });
await call('game_input', { game: gameId, events: [{ t: 0, type: 'keyDown', key: 'ArrowRight' }] });
await call('game_state', { game: gameId });
await call('game_state', { game: 'some-other-game' });
await call('game_create', { name: 'Elsewhere', engine: 'phaser', dimension: '2d' });

if (argv.some((a) => a.includes('HANG'))) {
  const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  seen.grandchildPid = grandchild.pid;
  seen.parked = true;
  save();
  setInterval(() => {}, 1000);
} else {
  mkdirSync(join(cwd, 'src'), { recursive: true });
  writeFileSync(join(cwd, 'src', 'agent-edit.js'), 'export const edited = true;\n');
  shim.stdin.end();
  seen.done = true;
  save();
  process.stdout.write('Added src/agent-edit.js.\n');
  process.exit(0);
}
