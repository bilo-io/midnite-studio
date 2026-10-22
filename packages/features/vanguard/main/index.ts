import { defineFeatureMain } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';
import {
  registerFindingsHandlers,
  type FindingsHandlersServices,
} from './findings-handlers';

export {
  registerFindingsHandlers,
  type FindingsHandlersServices,
} from './findings-handlers';

export type VanguardMainServices = FindingsHandlersServices;

export const vanguardMain = defineFeatureMain<VanguardMainServices>({
  feature: 'vanguard',
  channels: [
    CHANNELS.securityFindingsList,
    CHANNELS.securityFindingsSetStatus,
    CHANNELS.securityFindingsAct,
  ],
  register(ctx, services) {
    registerFindingsHandlers(ctx, services);
  },
});
