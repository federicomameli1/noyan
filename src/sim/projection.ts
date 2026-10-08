// Equirectangular projection used by the map: longitude and latitude become pixel
// coordinates on the map. K corrects longitude for the mean latitude (39.5°).

export const BBOX = { lon0: 102, lon1: 125, lat0: 33, lat1: 46 } as const;
export const PX_PER_DEGREE = 60;
export const K = Math.cos((39.5 * Math.PI) / 180);
export const WIDTH = Math.round((BBOX.lon1 - BBOX.lon0) * PX_PER_DEGREE * K);
export const HEIGHT = Math.round((BBOX.lat1 - BBOX.lat0) * PX_PER_DEGREE);

export type Point = readonly [number, number];

export function project(lon: number, lat: number): Point {
  return [(lon - BBOX.lon0) * PX_PER_DEGREE * K, (BBOX.lat1 - lat) * PX_PER_DEGREE];
}
