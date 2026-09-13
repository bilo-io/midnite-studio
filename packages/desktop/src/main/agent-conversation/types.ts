/**
 * Interface for resolving agent-native conversation ids from on-disk agent stores (Phase 86).
 */
export interface AgentConversationAdapter {
  /**
   * Locate the conversation id (UUID) for a session in the given working directory,
   * matching within the time window [since, until ?? Date.now()].
   *
   * Read-only and best effort: returns null if the store does not exist,
   * has no matching records, has malformed files, or suffers a tie.
   */
  locate(cwd: string, since: number, until?: number): Promise<string | null>;
}
