import { useLoopsHost, type LoopsState, type LoopsTerminalState } from './host';

/** The loops' slice of the app's UI store, through the host. */
export function useLoopsState<T>(selector: (state: LoopsState) => T): T {
  return useLoopsHost().useLoopsState(selector);
}

/** The narrow terminal-store read, through the host. */
export function useLoopsTerminal<T>(selector: (state: LoopsTerminalState) => T): T {
  return useLoopsHost().useTerminal(selector);
}
