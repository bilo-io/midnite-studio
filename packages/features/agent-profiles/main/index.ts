import { readFile, stat, writeFile } from 'node:fs/promises';

import { defineFeatureMain } from '@midnite/studio-runtime';
import {
  AGENT_PROFILE_NOT_FOUND,
  AgentProfileSchema,
  CHANNELS,
  failure,
  newAgentProfileId,
  ok,
  schemas,
  uniqueProfileName,
  type AgentProfile,
  type GitOpResult,
} from '@midnite/studio-shared';

import { agentProfilesManifest } from '../manifest';
import {
  deleteAgentProfile,
  getAgentProfile,
  listAgentProfiles,
  saveAgentProfile,
} from './agent-profiles-service';

export { agentProfilesManifest, type AgentProfilesManifest } from '../manifest';
export {
  AGENT_PROFILE_LIMIT_MESSAGE,
  agentProfilePromptPath,
  configureAgentProfiles,
  deleteAgentProfile,
  getAgentProfile,
  listAgentProfiles,
  resetAgentProfilesState,
  saveAgentProfile,
  type SaveAgentProfileResult,
} from './agent-profiles-service';
export {
  AGENT_PROFILES_FILE_NAME,
  createAgentProfilesStore,
  nullAgentProfilesStore,
  type AgentProfilesStore,
} from './agent-profiles-store';

/** The most an imported agent file may weigh. */
export const MAX_AGENT_IMPORT_BYTES = 1_000_000;

/**
 * A launch for a profile, filled only by Studio (Phase 154 Theme G). `prepare` builds the whole typed line
 * and returns the `launchId` the pty create call carries as `profileLaunchId`.
 */
export type AgentProfileLaunchService = {
  prepare(profile: AgentProfile, req: { cwd: string; resume: boolean }): Promise<{ launchId: string; line: string }>;
};

/** The native dialogs the feature opens, bound by the composer because a dialog is Electron's. */
export type AgentProfileDialogs = {
  /** An "open file" dialog; resolves to the chosen path, or `null` when dismissed. */
  pickFile(options: { title: string; filters: { name: string; extensions: string[] }[] }): Promise<string | null>;
  /** A "save" dialog; resolves to the chosen path, or `null` when dismissed. */
  pickSavePath(options: { title: string; defaultPath: string }): Promise<string | null>;
};

export type AgentProfilesMainServices = {
  dialogs: AgentProfileDialogs;
  /** Absent in the Agents host, which cannot launch a session. */
  launch?: AgentProfileLaunchService;
};

const NOT_AN_AGENT = 'That file is not a Midnite agent.';
const TOO_LARGE = 'That file is too large to be an agent.';

/** `Code Reviewer!` -> `code-reviewer`. */
export function agentFileSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'agent';
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Runs `task`, turning a throw into the `GitOpResult` failure envelope (IPC ops never throw across the boundary). */
async function guarded<R>(task: () => Promise<R>): Promise<R | GitOpResult> {
  try {
    return await task();
  } catch (error) {
    return failure(messageOf(error));
  }
}

/**
 * The custom-agents feature's main half (Phase 154): list, save (conflict-aware), delete, export, import
 * and `prepareLaunch`. Where the store lives is the composer's call (it calls `configureAgentProfiles`).
 */
export const agentProfilesMain = defineFeatureMain<AgentProfilesMainServices>({
  feature: agentProfilesManifest.feature,
  channels: agentProfilesManifest.ipc,
  register(ctx, services) {
    const { ipc } = ctx;

    ipc.handleBare(CHANNELS.agentProfileList, () =>
      guarded(async () => ok({ profiles: await listAgentProfiles() })),
    );

    ipc.handle(
      CHANNELS.agentProfileSave,
      schemas.AgentProfileSaveRequest,
      ({ profile, expectedUpdatedAt }) => guarded(async () => ok(await saveAgentProfile(profile, expectedUpdatedAt))),
      (issue) => failure(issue),
    );

    ipc.handle(
      CHANNELS.agentProfileDelete,
      schemas.AgentProfileDeleteRequest,
      ({ id }) =>
        guarded(async () => {
          await deleteAgentProfile(id);
          return ok();
        }),
      (issue) => failure(issue),
    );

    ipc.handle(
      CHANNELS.agentProfileExport,
      schemas.AgentProfileExportRequest,
      ({ id }) =>
        guarded(async () => {
          const profile = await getAgentProfile(id);
          if (!profile) return failure(AGENT_PROFILE_NOT_FOUND);
          const path = await services.dialogs.pickSavePath({
            title: 'Export agent',
            defaultPath: `${agentFileSlug(profile.name)}.agent.json`,
          });
          if (path === null) return ok({ path: null });
          await writeFile(path, `${JSON.stringify({ version: 1, profile }, null, 2)}\n`, 'utf8');
          return ok({ path });
        }),
      (issue) => failure(issue),
    );

    ipc.handleBare(CHANNELS.agentProfileImport, () =>
      guarded(async () => {
        const path = await services.dialogs.pickFile({
          title: 'Import agent',
          filters: [{ name: 'Midnite agent', extensions: ['json'] }],
        });
        if (path === null) return ok({ profile: null });
        if ((await stat(path)).size > MAX_AGENT_IMPORT_BYTES) return failure(TOO_LARGE);

        let raw: unknown;
        try {
          raw = JSON.parse(await readFile(path, 'utf8'));
        } catch {
          return failure(NOT_AN_AGENT);
        }
        const file = typeof raw === 'object' && raw !== null ? (raw as { version?: unknown; profile?: unknown }) : null;
        const parsed = file && file.version === 1 ? AgentProfileSchema.safeParse(file.profile) : null;
        if (!parsed?.success) return failure(NOT_AN_AGENT);

        const now = Date.now();
        const names = (await listAgentProfiles()).map((p) => p.name);
        const fresh: AgentProfile = {
          ...parsed.data,
          id: newAgentProfileId(),
          name: uniqueProfileName(`${parsed.data.name} (imported)`, names),
          createdAt: now,
          updatedAt: now,
        };
        const saved = await saveAgentProfile(fresh, null);
        return saved.status === 'saved' ? ok({ profile: saved.profile }) : failure(NOT_AN_AGENT);
      }),
    );

    ipc.handle(
      CHANNELS.agentProfilePrepareLaunch,
      schemas.AgentProfilePrepareLaunchRequest,
      ({ profileId, cwd, resume }) =>
        guarded(async () => {
          if (!services.launch) return failure('Launching needs Midnite Studio.');
          const profile = await getAgentProfile(profileId);
          if (!profile) return failure(AGENT_PROFILE_NOT_FOUND);
          return ok(await services.launch.prepare(profile, { cwd, resume }));
        }),
      (issue) => failure(issue),
    );
  },
});
