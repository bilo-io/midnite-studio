import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { dialog, type BrowserWindow } from 'electron';

import { CHANNELS, EVENT_CHANNELS, MUSIC_MIDI_FILE_EXTENSIONS, failure, loopModelArgs, ok, schemas } from '@midnite/studio-shared';

import { createAgyRegistration } from '../media/music/agy-registration';
import { createIterativeHost } from '../media/model/iterative-host';
import { createLlmCall } from '../media/model/engines';
import { createMusicAgents } from '../media/music/music-agents';
import { createMusicTools } from '../media/music/music-mcp';
import { runFfmpegExport } from '../media/export-service';
import { createMusicExporter } from '../media/music/music-export';
import { createMusicService } from '../media/music/music-service';
import { getMcpAllowMusic, getMcpStatus, mcpShimScriptPath } from '../mcp';
import { setMusicTools } from '../mcp/music-tools';
import { resolveWorkdir } from '../repo-registry';
import { resolveRegisteredRepo } from '../mcp/tools';
import { broadcastToAllWindows } from '../window-manager';
import { handle, handleFromSender } from './handle';
import { ffmpegStatus, mediaStore } from './media-handlers';
import { engines } from './media-model-handlers';

/**
 * Music editor (Phase 101 Theme B) — songs as `.mid` + `.song.json` inside an Audio project. File
 * access goes through the media store's jail; Import's files come from main's own native dialog.
 */
const service = createMusicService<BrowserWindow>({
  listFiles: (scope) => mediaStore.listFiles(scope),
  readFile: (req) => mediaStore.readFile(req),
  writeBytes: (req) => mediaStore.writeBytes(req),
  removeFile: (req) => mediaStore.removeFile(req),
  readLocal: (absPath) => readFile(absPath),
  pickFiles: async (win) => {
    const options = {
      title: 'Import MIDI',
      properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'>,
      filters: [{ name: 'MIDI', extensions: [...MUSIC_MIDI_FILE_EXTENSIONS] }],
    };
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return picked.canceled ? null : picked.filePaths;
  },
});

/**
 * The `music_*` MCP tools (Phase 101 Theme H): thin adapters over this file's own song service, so an
 * agent's edit lands in the same `.mid` + `.song.json` the editor writes. Every tool that changes a
 * song sits behind the `allowMusic` switch (`mcp/music-tools.ts`); edits are broadcast to every window
 * as one `music-changed` event each, and `music_open` as `music-open`.
 */
export const musicTools = createMusicTools({
  resolveRepo: async (repoPath) => {
    const resolved = await resolveRegisteredRepo(repoPath);
    if (resolved.ok) return { ok: true, repoId: resolved.repo.descriptor.id };
    return { ok: false, kind: resolved.error.kind === 'not-found' ? 'not-found' : 'refused', message: resolved.error.message };
  },
  listProjects: (repoId) => mediaStore.listProjects({ repoId, tab: 'audio' }),
  listSongs: (repoId, project) => service.list(repoId, project),
  readSong: (repoId, project, name) => service.read(repoId, project, name),
  writeSong: (repoId, project, name, song) => service.write(repoId, project, name, song),
  emitChanged: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaMusicChanged, event),
  emitOpen: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaMusicOpen, event),
});
setMusicTools(musicTools);

export const musicService = service;

/**
 * Antigravity's own MCP config: there is no per-run flag, so Midnite's server has to be listed there
 * for agy to refine a song over several passes. Only ever written after the user's explicit consent.
 */
export const agyRegistration = createAgyRegistration({
  configPath: join(homedir(), '.gemini', 'antigravity', 'mcp_config.json'),
  readFile: async (path) => {
    try {
      return await readFile(path, 'utf8');
    } catch {
      return null;
    }
  },
  writeFile: async (path, text) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text, 'utf8');
  },
  // The shim runs under the app's own binary as plain node, like the per-run servers' shim.
  shimLaunch: () => ({ command: process.execPath, args: [mcpShimScriptPath()], env: { ELECTRON_RUN_AS_NODE: '1' } }),
});

/** Themes J/K: save dialog + ffmpeg live here; the song/session logic is `music-export.ts`. */
const exporter = createMusicExporter<BrowserWindow>({
  pickSavePath: async (win, req) => {
    const options = {
      defaultPath: join(req.defaultDir ?? '', req.defaultName),
      filters: [{ name: req.label, extensions: [req.ext] }],
    };
    const picked = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    return picked.canceled || !picked.filePath ? null : picked.filePath;
  },
  writeLocal: async (path, data) => {
    await writeFile(path, data);
  },
  transcodeMp3: async ({ exportId, wav, dest, bitrateKbps }) => {
    const ffmpeg = await ffmpegStatus();
    if (!ffmpeg.found) return failure(ffmpeg.reason);
    const input = join(tmpdir(), `midnite-music-${exportId}.wav`);
    await writeFile(input, wav);
    try {
      return await runFfmpegExport(
        { exportId, format: 'mp3', input, dest, options: { bitrateKbps } },
        { ffmpegPath: ffmpeg.path, emit: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaExportProgress, event) },
      );
    } finally {
      await rm(input, { force: true });
    }
  },
  writeBytes: (req) => mediaStore.writeBytes(req),
  readText: (req) => mediaStore.readFile({ ...req, encoding: 'utf8' }),
  ensureSong: async (repoId, project, name, song) => {
    const existing = await service.read(repoId, project, name);
    if (existing.ok) return ok();
    const written = await service.write(repoId, project, name, song);
    return written.ok ? ok() : written;
  },
});

const llm = createLlmCall(engines);
const musicAgents = createMusicAgents({
  tools: musicTools,
  host: createIterativeHost(),
  repoPath: async (repoId) => (await resolveWorkdir(repoId)) ?? null,
  complete: (req) => llm({ engine: req.engine, repoId: req.repoId, prompt: req.prompt, signal: req.signal, json: req.engine.kind === 'ollama' }),
  modelArgs: (agentId, model) => (model ? loopModelArgs(agentId, model) : []),
  agyRegistered: async () => {
    const status = await agyRegistration.status();
    return status.ok && status.value.registered;
  },
  globalMusicReady: () => getMcpStatus().running && getMcpAllowMusic(),
  ensureSong: async (repoId, project, name, song) => {
    const existing = await service.read(repoId, project, name);
    if (existing.ok) return ok({ existed: true });
    const written = await service.write(repoId, project, name, song);
    return written.ok ? ok({ existed: false }) : written;
  },
  emitProgress: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaMusicAgentProgress, event),
});

export function registerMediaMusicHandlers(): void {
  const invalid = (issue: string) => failure(issue);
  handle(CHANNELS.mediaMusicList, schemas.MediaMusicListRequest, (r) => service.list(r.repoId, r.project), invalid);
  handle(CHANNELS.mediaMusicRead, schemas.MediaMusicReadRequest, (r) => service.read(r.repoId, r.project, r.name), invalid);
  handle(
    CHANNELS.mediaMusicWrite,
    schemas.MediaMusicWriteRequest,
    (r) => service.write(r.repoId, r.project, r.name, r.song),
    invalid,
  );
  handleFromSender(
    CHANNELS.mediaMusicImport,
    schemas.MediaMusicImportRequest,
    (r, win) => service.importFiles(r.repoId, r.project, win ?? undefined),
    invalid,
  );
  handle(CHANNELS.mediaMusicDelete, schemas.MediaMusicDeleteRequest, (r) => service.remove(r.repoId, r.project, r.name), invalid);
  handleFromSender(
    CHANNELS.mediaMusicExport,
    schemas.MediaMusicExportRequest,
    (r, win) => exporter.exportSong(r, win ?? undefined),
    invalid,
  );
  handle(CHANNELS.mediaMusicSendToGenerator, schemas.MediaMusicSendToGeneratorRequest, (r) => exporter.sendToGenerator(r), invalid);
  handle(CHANNELS.mediaMusicAgentRun, schemas.MediaMusicAgentRunRequest, (r) => musicAgents.run(r), invalid);
  handle(CHANNELS.mediaMusicAgentCancel, schemas.MediaMusicAgentCancelRequest, (r) => musicAgents.cancel(r.runId), invalid);
  handle(
    CHANNELS.mediaMusicAgy,
    schemas.MediaMusicAgyRequest,
    (r) =>
      r.op === 'register'
        ? agyRegistration.register({ consent: r.consent })
        : r.op === 'unregister'
          ? agyRegistration.unregister()
          : agyRegistration.status(),
    invalid,
  );
}
