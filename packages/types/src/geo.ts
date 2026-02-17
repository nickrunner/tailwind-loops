/**
 * Geographic utility types.
 */

/** Axis-aligned bounding box in WGS84 coordinates */
export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}
