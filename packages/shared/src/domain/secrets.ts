/**
 * Enum of secrets main may store in the app vault — kept short and explicit
 * so the channel cannot become a general-purpose store by accident (Phase 76
 * Theme D). `ollama.apiKey` (Phase 96 Theme F) is the cloud API key from
 * `ollama.com/settings/keys` — set/cleared from Settings ▸ Ollama, read only
 * by main (`ollamaLaunchRecipe`'s `authToken`, the cloud-catalogue fetch);
 * the wire only ever carries whether it is set (`secretsHas`), never the
 * value, unlike `finance.twelveData`'s own `secretsGet`.
 */
export const SECRET_KEYS = ['finance.twelveData', 'ollama.apiKey'] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];
