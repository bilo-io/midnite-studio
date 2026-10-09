import { z } from 'zod';

import { GitOpResultOf } from './domain/result';
import { MediaProjectNameSchema } from './media';
import { SongNameSchema } from './media-music';

/**
 * The song chat (Phase 101 Theme I): each song keeps its own conversation with an agent, stored
 * beside it as `<name>.chat.json`. Main reads and writes the file as opaque JSON validated here;
 * the thread, composer and markdown renderer are the Chats page's, in the renderer.
 */
export const MUSIC_CHAT_EXT = '.chat.json';
export const musicChatPath = (name: string): string => `${name}${MUSIC_CHAT_EXT}`;
export const MUSIC_CHAT_MAX_MESSAGES = 400;
/** Most note indices one change entry remembers for "Show in piano roll". */
export const MUSIC_CHAT_MAX_SELECTION = 2000;

/** What one agent turn did to one track: the bars it touched and the notes to select. */
export const SongChatChangeSchema = z.object({
  trackId: z.string().min(1).max(64),
  trackName: z.string().max(120),
  /** 1-based, inclusive. */
  fromBar: z.number().int().min(1),
  toBar: z.number().int().min(1),
  added: z.number().int().min(0),
  removed: z.number().int().min(0),
  /** Indices into the track's notes after the turn — what the link selects in the piano roll. */
  noteIndices: z.array(z.number().int().min(0)).max(MUSIC_CHAT_MAX_SELECTION).default([]),
});
export type SongChatChange = z.infer<typeof SongChatChangeSchema>;

export const SongChatMessageSchema = z.object({
  id: z.string().min(1).max(64),
  role: z.enum(['user', 'assistant']),
  text: z.string().max(20_000),
  at: z.number().int().nonnegative(),
  /** How the turn ended; user messages carry none. */
  state: z.enum(['done', 'failed', 'cancelled']).optional(),
  changes: z.array(SongChatChangeSchema).max(64).optional(),
  /** Tempo, new tracks and the like that have no bar to point at. */
  extras: z.array(z.string().max(200)).max(16).optional(),
  /** The picker id of the engine that produced the reply. */
  engine: z.string().max(64).optional(),
  /** Engine label that produced the reply ("Claude · refined over 4 passes"). */
  via: z.string().max(200).optional(),
});
export type SongChatMessage = z.infer<typeof SongChatMessageSchema>;

export const SongChatSchema = z.object({
  version: z.literal(1).default(1),
  /** The picker's choice for this song; `null` means "the default". */
  engine: z.string().max(64).nullable().default(null),
  model: z.string().max(120).nullable().default(null),
  messages: z.array(SongChatMessageSchema).max(MUSIC_CHAT_MAX_MESSAGES).default([]),
});
export type SongChat = z.infer<typeof SongChatSchema>;

const Scope = { repoId: z.string().min(1), project: MediaProjectNameSchema, name: SongNameSchema };

/** One channel, two ops. `read` answers an empty chat for a song that has none yet. */
export const MusicChatRequestSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('read'), ...Scope }),
  z.object({ op: z.literal('write'), ...Scope, chat: SongChatSchema }),
]);
export type MusicChatRequest = z.infer<typeof MusicChatRequestSchema>;
export const MusicChatResultSchema = GitOpResultOf(SongChatSchema);
