import type { ResourceSource } from '../resolve';
import { AGENT_SOURCES } from './agent';
import { GIT_SOURCES } from './git';
import { NOTES_MEDIA_SOURCES } from './notes-media';
import { TOOLS_SOURCES } from './tools';

/**
 * Phase 112 Theme G — every list the resolver asks, by family (the same split
 * as `revealers/`). Each reads a list that already exists; none is an index.
 */
export const DEFAULT_SOURCES: readonly ResourceSource[] = [...GIT_SOURCES, ...AGENT_SOURCES, ...NOTES_MEDIA_SOURCES, ...TOOLS_SOURCES];
