// The maths lives in shared since Phase 152 D (main needs it to write Runway lines); this keeps the renderer's import path.
export {
  computeFleetProjection,
  type FleetMonth,
  type FleetNodeFigures,
  type FleetProjectionResult,
} from '@midnite/studio-shared';
