/**
 * The pieces of Sprites an app mounts *outside* its Media view (Phase 113 Theme S): the render-request host
 * and the `sprite_open` request store. Their own entry (`@midnite/studio-feature-media-sprite/events`) so an
 * app root — which loads eagerly — imports two small modules, not the whole tab with its forms and previewer.
 */
export { handleRenderRequest, SpriteRenderHost, useSpriteRenderHost, type LoadRenderJob } from './render/sprite-render-host';
export { useSpriteOpenRequest } from './use-sprite-agent-events';
export type { SpriteRenderJobApi, SpriteRenderJobModule } from './host';
