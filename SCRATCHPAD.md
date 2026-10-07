# Scratchpad
Task: Phase 106 H+I, one PR. Started.
## Decisions
- prop-sheet kind kept as 'prop-sheet' (doc says 'props'); atlas frame name = prop name.
- Autotile: bilinear quadrant field (centre=b, edge mids, vertex=all-4), periodic noise; masks byte-identical on shared edges (edge ring sampled on the edge).
- Terrain->tiles: job on a tileset asset with spec.fromTerrain (no new IPC channel).
- iso block cell = 2s x 1.5s; floor at cell bottom.
## Done
- shared: seamless, autotile, tiled, iso, terrain-tiles (+tests), spec schemas in media-sprite.ts
## Next
- fix media-sprite.test, app usages; desktop runners (tileset/environment), export branches; app forms; trackers; screenshots
