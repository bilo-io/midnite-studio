import {
  useTasksHost,
  type TasksAutomateInput,
  type TasksCardPlay,
  type TasksCardPlayInput,
  type TasksTerminalPort,
  type TasksTerminalState,
} from './host';

/**
 * The app's terminal store as Tasks reads it — or, for an app with no terminals
 * (Coder), an empty one: no sessions, so every card is idle, every glow is the
 * card's own status colour, and no Play/Stop/terminal control is drawn.
 */
const EMPTY_TERMINAL: TasksTerminalState = {
  sessions: [],
  states: {},
  activity: {},
  liveAgentId: {},
  hydrate: () => Promise.resolve(),
  rehomeSession: () => {},
};

function useEmptyTerminal<T>(selector: (state: TasksTerminalState) => T): T {
  return selector(EMPTY_TERMINAL);
}

export type TasksTerminal = {
  /** A hook over the terminal slice — call it unconditionally, like any hook. */
  useSlice: <T>(selector: (state: TasksTerminalState) => T) => T;
  getState: () => TasksTerminalState;
  /** The app's terminal port, or undefined when it has none. */
  port: TasksTerminalPort | undefined;
};

const NO_TERMINAL: TasksTerminal = { useSlice: useEmptyTerminal, getState: () => EMPTY_TERMINAL, port: undefined };

export function useTasksTerminal(): TasksTerminal {
  const { terminal } = useTasksHost();
  if (!terminal) return NO_TERMINAL;
  return { useSlice: terminal.useTerminal, getState: terminal.getTerminal, port: terminal };
}

const NO_PLAY: TasksCardPlay = { onPlay: (event) => event.stopPropagation() };

function useNoCardPlay(_input: TasksCardPlayInput): TasksCardPlay {
  return NO_PLAY;
}

/** A card's Play — the app's launcher, or a no-op the caller never draws a button for. */
export function useTasksCardPlay(input: TasksCardPlayInput): TasksCardPlay {
  const { port } = useTasksTerminal();
  const useCardPlay = port?.useCardPlay ?? useNoCardPlay;
  return useCardPlay(input);
}

function useNoAutomate(_input: TasksAutomateInput): void {}

/** Auto-mate's effects for a board — the app's, or nothing. */
export function useTasksAutomate(input: TasksAutomateInput): void {
  const { port } = useTasksTerminal();
  const useAutomate = port?.useAutomate ?? useNoAutomate;
  useAutomate(input);
}
