/**
 * Moved into the runtime with the broker client (Phase 113 Theme D): both
 * ends of the broker socket queue writes the same way. Re-exported by file so
 * the broker bundle takes only this module, not the runtime barrel.
 */
export * from '@midnite/studio-runtime/broker/socket-write-queue';
