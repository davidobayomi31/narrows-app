// Dependency-free marker clustering. Groups nearby points into grid cells sized
// as a fraction of the visible map span, so the clustering tightens as you zoom
// in and loosens as you zoom out — without any native library. Good enough for
// a hyper-local app's pin counts, and it works with plain react-native-maps.

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type Cluster<T> = {
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  items: T[];
};

export function clusterPoints<T extends { latitude: number; longitude: number }>(
  points: T[],
  region: Region,
  // cluster cell size as a fraction of the visible span (~12% ≈ merge markers
  // within roughly an eighth of the screen)
  cellFraction = 0.12
): Cluster<T>[] {
  const cellLat = Math.max(region.latitudeDelta * cellFraction, 1e-6);
  const cellLon = Math.max(region.longitudeDelta * cellFraction, 1e-6);

  const groups = new Map<string, T[]>();
  for (const p of points) {
    const key = `${Math.floor(p.latitude / cellLat)}:${Math.floor(p.longitude / cellLon)}`;
    const arr = groups.get(key);
    if (arr) arr.push(p);
    else groups.set(key, [p]);
  }

  const clusters: Cluster<T>[] = [];
  for (const [key, items] of groups) {
    let lat = 0;
    let lon = 0;
    for (const it of items) {
      lat += it.latitude;
      lon += it.longitude;
    }
    clusters.push({
      id: `cluster-${key}`,
      latitude: lat / items.length,
      longitude: lon / items.length,
      count: items.length,
      items,
    });
  }
  return clusters;
}
