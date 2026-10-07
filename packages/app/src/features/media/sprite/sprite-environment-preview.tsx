import { backgroundLayerFile, MEDIA_ROOT_DIR, mstudioFileUrl, type SpriteAssetSpec } from '@midnite/studio-shared';
import { useState } from 'react';

import { SPRITE_CHECKER } from './sprite-checker';
import { SpriteExportBar } from './sprite-animator';
import { SpriteMapPreview } from './sprite-map-preview';
import type { SpriteRef } from './use-sprite';

/**
 * What an environment asset looks like once its job has run (Phase 106 Themes H and I): the tileset
 * sheet (and its terrain map), the parallax layers with a camera slider that moves each by its scroll
 * factor, the props, or a map (Theme J) — each with the pack export beside them.
 */
export type SpriteEnvironmentSpec = Extract<SpriteAssetSpec, { kind: 'tileset' | 'background' | 'prop-sheet' | 'map' }>;

const checker = { ...SPRITE_CHECKER, imageRendering: 'pixelated' as const };

export function SpriteEnvironmentPreview({ repoId, target, spec, version, busy }: { repoId: string; target: SpriteRef; spec: SpriteEnvironmentSpec; version: string; busy: boolean }) {
  const built = spec.lastReport !== undefined;
  const url = (path: string) => `${mstudioFileUrl('repo', repoId, `${MEDIA_ROOT_DIR}/sprite/${target.group}/${target.asset}/${path}`)}?v=${encodeURIComponent(version)}`;
  const noun = spec.kind === 'tileset' ? 'tiles' : spec.kind === 'background' ? 'layers' : spec.kind === 'map' ? 'map' : 'props';
  return (
    <section aria-label="Preview" className="flex flex-col gap-2" data-testid="sprite-environment-preview">
      <SpriteExportBar repoId={repoId} target={target} hasFrames={built && !busy} busy={busy} noun={noun} />
      {!built ? (
        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          {spec.kind === 'tileset' ? 'No tiles yet. Press Generate.' : spec.kind === 'background' ? 'No layers yet. Press Generate.' : spec.kind === 'map' ? 'No map yet. Press Generate.' : 'No props yet. Press Generate.'}
        </p>
      ) : spec.kind === 'tileset' ? (
        <TilesetPreview spec={spec} url={url} />
      ) : spec.kind === 'map' ? (
        <SpriteMapPreview url={url} version={version} />
      ) : spec.kind === 'background' ? (
        <ParallaxPreview spec={spec} url={url} />
      ) : (
        <PropsPreview spec={spec} url={url} />
      )}
    </section>
  );
}

function TilesetPreview({ spec, url }: { spec: Extract<SpriteEnvironmentSpec, { kind: 'tileset' }>; url: (path: string) => string }) {
  const bases = spec.fromTerrain ? [] : spec.terrains;
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-auto rounded-md border border-border/60 p-1" style={checker}>
        <img alt="Tileset" src={url('tileset.png')} style={{ imageRendering: 'pixelated', minWidth: 256 }} className="max-w-none" data-testid="tileset-sheet" />
      </div>
      {bases.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Base tiles">
          {bases.map((t) => (
            <li key={t.id} className="flex flex-col items-center gap-0.5 text-[10px] text-muted-foreground">
              <img alt={t.label} src={url(`terrains/${t.id}.png`)} width={48} height={48} style={{ imageRendering: 'pixelated' }} className="rounded border border-border/60" />
              {t.label}
            </li>
          ))}
        </ul>
      ) : null}
      {spec.fromTerrain ? <p className="text-[11px] text-muted-foreground">Cut from {spec.fromTerrain.terrain} at {spec.fromTerrain.metresPerTile} m per tile. The map, map.tmj, is exported with the tileset.</p> : null}
    </div>
  );
}

function ParallaxPreview({ spec, url }: { spec: Extract<SpriteEnvironmentSpec, { kind: 'background' }>; url: (path: string) => string }) {
  const [camera, setCamera] = useState(0);
  const [w, h] = spec.size;
  return (
    <div className="flex flex-col gap-2">
      <div className="relative w-full overflow-hidden rounded-md border border-border/60 bg-muted" style={{ aspectRatio: `${w} / ${h}` }} data-testid="parallax-stage">
        {spec.layers.map((layer, index) => (
          <div
            key={layer.name}
            role="img"
            aria-label={`${layer.name} layer`}
            data-testid={`parallax-layer-${layer.name}`}
            className="absolute inset-0"
            style={{ backgroundImage: `url("${url(backgroundLayerFile(layer.name))}")`, backgroundRepeat: 'repeat-x', backgroundSize: 'auto 100%', backgroundPosition: `${-camera * layer.scrollFactor}px 0`, zIndex: index }}
          />
        ))}
      </div>
      <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
        Camera
        <input aria-label="Camera" type="range" min={0} max={w} value={camera} onChange={(e) => setCamera(Number(e.target.value))} className="flex-1" />
      </label>
      <ul className="flex flex-wrap gap-x-3 text-[10px] text-muted-foreground" aria-label="Scroll factors">
        {spec.layers.map((l) => (
          <li key={l.name}>
            {l.name} {l.scrollFactor}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PropsPreview({ spec, url }: { spec: Extract<SpriteEnvironmentSpec, { kind: 'prop-sheet' }>; url: (path: string) => string }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Props">
      {spec.props.map((p) => (
        <li key={p.name} className="flex flex-col items-center gap-0.5 text-[10px] text-muted-foreground">
          <div className="rounded border border-border/60" style={{ ...checker, width: spec.cell[0] * 2, height: spec.cell[1] * 2 }}>
            <img alt={p.name} src={url(`props/${p.name}/000.png`)} width={spec.cell[0] * 2} height={spec.cell[1] * 2} style={{ imageRendering: 'pixelated' }} />
          </div>
          {p.name}
        </li>
      ))}
    </ul>
  );
}
