// Moved to the models feature's main half (Phase 113 Theme N) — the workflows feature's `ai-*`
// nodes reach it through a port, and Agents implements that port with it too. Kept importable
// from here so the wand and Plan with AI do not move.
export { runOllamaPrompt, type OllamaHeadlessDeps } from '@midnite/studio-feature-models/main';
