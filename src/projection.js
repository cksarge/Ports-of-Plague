// Map projection shared by the map builder and the interface: an
// equirectangular projection centred on Europe (longitude scaled by the
// cosine of 46°N so shapes look right).
export const PROJECTION = { west: -11, east: 42, north: 62.5, south: 29.5, phi0: 46, width: 1000 };

const K = PROJECTION.width / ((PROJECTION.east - PROJECTION.west) * Math.cos((PROJECTION.phi0 * Math.PI) / 180));
export const MAP_HEIGHT = Math.round((PROJECTION.north - PROJECTION.south) * K);

export function project(lon, lat) {
  const x = (lon - PROJECTION.west) * Math.cos((PROJECTION.phi0 * Math.PI) / 180) * K;
  const y = (PROJECTION.north - lat) * K;
  return [x, y];
}
