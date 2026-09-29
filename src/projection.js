// Map projection shared by the map builder and the interface: an
// equirectangular projection centred on Europe. Longitude is scaled by the
// cosine of 36°N (a little wider than true at northern latitudes) so the
// board fills a wide screen and crowded cities sit further apart.
export const PROJECTION = { west: -11, east: 42, north: 62.5, south: 29.5, phi0: 36, height: 896 };

const K = PROJECTION.height / (PROJECTION.north - PROJECTION.south);
const COS = Math.cos((PROJECTION.phi0 * Math.PI) / 180);
export const MAP_HEIGHT = PROJECTION.height;
export const MAP_WIDTH = Math.round((PROJECTION.east - PROJECTION.west) * COS * K);

export function project(lon, lat) {
  const x = (lon - PROJECTION.west) * COS * K;
  const y = (PROJECTION.north - lat) * K;
  return [x, y];
}
