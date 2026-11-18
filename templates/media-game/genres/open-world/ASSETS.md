# Assets

This starter draws its people and drivable cars from code (generated placeholder shapes). It also
ships three models from the shared `gtact` asset library (below) for its small GTACT-style sample area
(a 200 m square around the origin: promenade spawn, helipad with a helicopter, an airstrip-start
checkpoint, a short road with parked cars), 2.6 MB in all. They are static props placed by name from
`levels/level.tmj` (`model` property); `assets/index.json` records where each came from
(`library: {library, path, sha256}`). The world is a terrain pack: a small **Phase 105 terrain pack** built by Midnite Studio's own
terrain pipeline from the noise preset and a plus-shaped roads mask (512 m across, 257²
heightfield), exported with *Export ▸ Terrain pack* and trimmed to LOD 1-3 to stay small. It is
generated in-house and carries no third-party content. `assets/index.json` names it
`terrain/world`; import a real terrain through the asset bridge and point that entry at it.

| File | Source URL | Licence | Author |
|---|---|---|---|
| `model/helicopter.glb` | shared library `gtact`: `models/aircraft/helicopter.glb` (1,007,696 bytes) | the GTACT game's own asset | GTACT |
| `model/fulmine.glb` | shared library `gtact`: `models/vehicles/fulmine.glb` (782,396 bytes) | the GTACT game's own asset | GTACT |
| `model/sedan.glb` | shared library `gtact`: `models/vehicles/sedan.glb` (837,120 bytes) | the GTACT game's own asset | GTACT |
| `terrain/fixture.terrain/buildings.json` | generated (Midnite Studio terrain pipeline) | CC0-1.0 | Midnite Studio |
| `terrain/fixture.terrain/chunks/lod1.glb` | generated (Midnite Studio terrain pipeline) | CC0-1.0 | Midnite Studio |
| `terrain/fixture.terrain/chunks/lod2.glb` | generated (Midnite Studio terrain pipeline) | CC0-1.0 | Midnite Studio |
| `terrain/fixture.terrain/chunks/lod3.glb` | generated (Midnite Studio terrain pipeline) | CC0-1.0 | Midnite Studio |
| `terrain/fixture.terrain/foliage.json` | generated (Midnite Studio terrain pipeline) | CC0-1.0 | Midnite Studio |
| `terrain/fixture.terrain/foliage/birch.glb` | generated (Midnite Studio terrain pipeline) | CC0-1.0 | Midnite Studio |
| `terrain/fixture.terrain/foliage/broadleaf.glb` | generated (Midnite Studio terrain pipeline) | CC0-1.0 | Midnite Studio |
| `terrain/fixture.terrain/foliage/bush.glb` | generated (Midnite Studio terrain pipeline) | CC0-1.0 | Midnite Studio |
| `terrain/fixture.terrain/foliage/grass-clump.glb` | generated (Midnite Studio terrain pipeline) | CC0-1.0 | Midnite Studio |
| `terrain/fixture.terrain/foliage/pine.glb` | generated (Midnite Studio terrain pipeline) | CC0-1.0 | Midnite Studio |
| `terrain/fixture.terrain/heightfield.json` | generated (Midnite Studio terrain pipeline) | CC0-1.0 | Midnite Studio |
| `terrain/fixture.terrain/heightfield.png` | generated (Midnite Studio terrain pipeline) | CC0-1.0 | Midnite Studio |
| `terrain/fixture.terrain/maps/drape.png` | generated (Midnite Studio terrain pipeline) | CC0-1.0 | Midnite Studio |
| `terrain/fixture.terrain/maps/landcover.json` | generated (Midnite Studio terrain pipeline) | CC0-1.0 | Midnite Studio |
| `terrain/fixture.terrain/maps/landcover.png` | generated (Midnite Studio terrain pipeline) | CC0-1.0 | Midnite Studio |
| `terrain/fixture.terrain/roads.json` | generated (Midnite Studio terrain pipeline) | CC0-1.0 | Midnite Studio |
| `terrain/fixture.terrain/terrain.manifest.json` | generated (Midnite Studio terrain pipeline) | CC0-1.0 | Midnite Studio |
