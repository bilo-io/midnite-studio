import type { WizardStep } from './wizard-step';
import { ForgeConnectStep } from './steps/forge-connect-step';
import { WelcomeStep } from './steps/welcome-step';

/**
 * The onboarding wizard, top to bottom (Phase 90 Theme I).
 *
 * A flat, ordered array, on purpose — `wizard-step.ts`'s own doc comment
 * names the two files this shape is copied from. **To add a step:** append a
 * row with its `id`, `title`, `optional` and `Component`; `onboarding-modal.tsx`
 * never changes for a new step, only for a new frame behaviour.
 */
export const ONBOARDING_STEPS: readonly WizardStep[] = [
  { id: 'welcome', title: 'Welcome to Midnite Studio', optional: false, Component: WelcomeStep },
  { id: 'forges', title: 'Connect your forges', optional: true, Component: ForgeConnectStep },
];
