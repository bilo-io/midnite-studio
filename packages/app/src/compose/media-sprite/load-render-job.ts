/**
 * The lazy import of Studio's 3D render job (three.js and the Model tab's rig code). Its own file so the
 * app root can pass it to `useSpriteRenderHost` without pulling the Sprites host — and with it the ai-thread
 * composer — into the entry chunk: nothing of the renderer loads until the first render request.
 */
export const loadSpriteRenderJob = () => import('./render-job');
