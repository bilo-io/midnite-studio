/**
 * Enum of secrets main may store in the app vault — kept short and explicit
 * so the channel cannot become a general-purpose store by accident (Phase 76
 * Theme D). `ollama.apiKey` (Phase 96 Theme F) is the cloud API key from
 * `ollama.com/settings/keys` — set/cleared from Settings ▸ Ollama, read only
 * by main (`ollamaLaunchRecipe`'s `authToken`, the cloud-catalogue fetch);
 * the wire only ever carries whether it is set (`secretsHas`), never the
 * value, unlike `finance.twelveData`'s own `secretsGet`.
 */
export const SECRET_KEYS = [
  'finance.twelveData',
  'ollama.apiKey',
  // Phase 99 Theme C — image-generation API keys, read only by main's
  // `media/image/` adapters; Settings ▸ Media uses `secretsHas`/`secretsSet`.
  'media.geminiApiKey',
  'media.openaiApiKey',
  // Phase 103 Theme J — an optional Hugging Face token for the SF3D download, read only by main's
  // `media/model/sf3d/installer.ts` and sent only as an `Authorization` header. The ONNX port it
  // downloads is not gated today, so it is usually unset.
  'media.huggingFaceToken',
  // Phase 108 Theme B — an optional MapTiler key unlocking its satellite, Terrain-RGB and styles. Read
  // only by main's `mstudio-tile:` protocol, which expands it into the upstream URL; never the renderer.
  'media.mapTilerApiKey',
] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];
