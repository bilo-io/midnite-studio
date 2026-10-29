/**
 * The one logging seam the scanners take. Studio's `Logger` (callable, with level methods) is
 * assignable to it; a host with no log sink passes nothing and the scanners stay quiet.
 */
export type OptimizerLog = (message: string) => void;

export const noopLog: OptimizerLog = () => undefined;
