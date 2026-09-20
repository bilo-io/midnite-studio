/**
 * Enum of secrets main may store in the app vault — one key today so the
 * channel cannot become a general-purpose store by accident (Phase 76 Theme D).
 */
export const SECRET_KEYS = ['finance.twelveData'] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];
