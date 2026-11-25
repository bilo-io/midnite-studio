import { getCompanionHost, type CompanionStore, type CompanionTerminalState, type CompanionUiState } from './host';

/**
 * The names the companion's files imported from the app, resolved through the installed
 * {@link CompanionHost} (Phase 123 Theme F).
 *
 * Every moved file kept its call sites — `useUiStore.getState()`, `startAgent(…)` — and swapped only
 * the import path to this module, so the extraction changed no logic. Each export reads the host
 * when it is *called*, never at module load, so importing the feature installs nothing.
 */

/** A store handle that looks the real one up on every use. */
function delegate<S>(pick: () => CompanionStore<S>): CompanionStore<S> {
  const hook = (<T>(selector: (state: S) => T): T => pick()(selector)) as CompanionStore<S>;
  hook.getState = () => pick().getState();
  hook.getInitialState = () => pick().getInitialState();
  hook.setState = (partial) => pick().setState(partial);
  hook.subscribe = (listener) => pick().subscribe(listener);
  return hook;
}

export const useUiStore: CompanionStore<CompanionUiState> = delegate(() => getCompanionHost().ui);
export type UiState = CompanionUiState;

export const useTerminalStore: CompanionStore<CompanionTerminalState> = delegate(() => getCompanionHost().terminal.store);

export const startAgent = (...args: Parameters<ReturnType<typeof getCompanionHost>['terminal']['startAgent']>) =>
  getCompanionHost().terminal.startAgent(...args);
export const startProfileAgent = (...args: Parameters<NonNullable<ReturnType<typeof getCompanionHost>['terminal']['startProfileAgent']>>) =>
  getCompanionHost().terminal.startProfileAgent?.(...args) ?? Promise.resolve(null);
export const skillHandoffAsProfile = (
  ...args: Parameters<NonNullable<ReturnType<typeof getCompanionHost>['terminal']['skillHandoffAsProfile']>>
) => getCompanionHost().terminal.skillHandoffAsProfile?.(...args) ?? Promise.resolve(null);
export const skillHandoff = (...args: Parameters<ReturnType<typeof getCompanionHost>['terminal']['skillHandoff']>) =>
  getCompanionHost().terminal.skillHandoff(...args);

export const useAgentProbeStore = {
  getState: () => ({ status: getCompanionHost().agentProbeStatus() }),
};

export const showToast = (...args: Parameters<ReturnType<typeof getCompanionHost>['showToast']>) =>
  getCompanionHost().showToast(...args);
export const dismissToast = (id: string) => getCompanionHost().dismissToast(id);
export const overlayDepth = () => getCompanionHost().overlayDepth();
export type { CompanionToastRequest as ToastRequest } from './host';
