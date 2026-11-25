import {
  LuActivity,
  LuBraces,
  LuCircle,
  LuCloud,
  LuCode,
  LuCpu,
  LuDatabase,
  LuDatabaseZap,
  LuFlaskConical,
  LuGitFork,
  LuLibrary,
  LuListTree,
  LuPlug,
  LuPlugZap,
  LuSearch,
  LuServer,
  LuShield,
  LuShieldCheck,
  LuSlidersHorizontal,
  LuTerminal,
  LuUsers,
  LuWorkflow,
} from 'react-icons/lu';

import type { IconComponent } from '@midnite/studio-frame';
import type { AgentBlueprintStageId } from '@midnite/studio-shared';

export const STAGE_ICONS: Record<AgentBlueprintStageId, IconComponent> = {
  orchestrate: LuWorkflow,
  ground: LuDatabase,
  act: LuPlug,
  adapt: LuSlidersHorizontal,
  operate: LuShieldCheck,
};

const OPTION_ICONS: Record<string, IconComponent> = {
  langgraph: LuGitFork,
  crewai: LuUsers,
  'llamaindex-workflows': LuListTree,
  custom: LuCode,
  'vector-db': LuDatabaseZap,
  'hybrid-search': LuSearch,
  'managed-kb': LuLibrary,
  mcp: LuPlugZap,
  'api-sdks': LuBraces,
  'local-exec': LuTerminal,
  'open-weight': LuCpu,
  'managed-apis': LuCloud,
  'prompt-evals': LuFlaskConical,
  hosting: LuServer,
  guardrails: LuShield,
  observability: LuActivity,
};

/** The glyph for a blueprint option; a plain circle for an id this build does not know. */
export function optionIcon(optionId: string): IconComponent {
  return OPTION_ICONS[optionId] ?? LuCircle;
}
