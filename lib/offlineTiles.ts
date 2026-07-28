import * as FS from 'expo-file-system/legacy';
import { Directory } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BASE_TILE_URL,
  TILE_REQUEST_HEADERS,
  OFFLINE_MAX_TILES,
} from '../constants/mapTiles';

// Offline tile engine. Downloads base + depth raster tiles for a bounding box
// into the exact on-disk layout react-native-maps expects for tileCachePath —
// `{cache}/{z}/{x}/{y}` (bare filename, no extension) — so that with
// offlineMode={true} the map serves them with no network. Verified against the
// installed react-native-maps native cache reader (iOS + Android).

export type LatLng = { latitude: number; longitude: number };
export type Bounds = { northEast: LatLng; southWest: LatLng };

// documentDirectory is safe from OS eviction (unlike the cache dir), so saved
// maps survive until the user deletes them. These same strings are handed to
// <UrlTile tileCachePath> / <WMSTile tileCachePath>.
const ROOT = `${FS.documentDirectory}narrows-tiles`;
export const BASE_TILE_CACHE = `${ROOT}/base`;
export const DEPTH_TILE_CACHE = `${ROOT}/depth`;

// depth export endpoint, kept in sync with MapScreen's DEPTH_EXPORT — prefetched
// by bbox so cached depth tiles land on the same keys the live WMSTile requests.
const DEPTH_EXPORT_BASE =
  'https://maps.simcoe.ca/arcgis/rest/services/Public/Bathymetry_Cache/MapServer/export';

// how many tiles to fetch at once — enough to be quick, gentle enough not to
// hammer the tile servers (each tile is a base + a depth request).
const CONCURRENCY = 6;

// --- web-mercator (EPSG:3857 / standard XYZ) tile math ---
const WORLD = 20037508.34789244; // half-extent of web mercator, in metres

function lngToTileX(lng: number, z: number) {
  return Math.floor(((lng + 180) / 360) * 2 ** z);
}
function latToTileY(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}
// bbox of a tile in EPSG:3857 metres — mirrors <WMSTile>'s own tile→bbox math so
// a prefetched depth tile matches the exact request the map will make.
function tileBBox3857(x: number, y: number, z: number) {
  const tile = (WORLD * 2) / 2 ** z;
  return {
    minX: -WORLD + x * tile,
    minY: WORLD - (y + 1) * tile,
    maxX: -WORLD + (x + 1) * tile,
    maxY: WORLD - y * tile,
  };
}

type TileRange = { xMin: number; xMax: number; yMin: number; yMax: number };
function tilesForBounds(bounds: Bounds, z: number): TileRange {
  const xs = [lngToTileX(bounds.southWest.longitude, z), lngToTileX(bounds.northEast.longitude, z)];
  const ys = [latToTileY(bounds.northEast.latitude, z), latToTileY(bounds.southWest.latitude, z)];
  return {
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
    yMin: Math.min(...ys),
    yMax: Math.max(...ys),
  };
}

export function estimateTileCount(bounds: Bounds, minZ: number, maxZ: number): number {
  let total = 0;
  for (let z = minZ; z <= maxZ; z++) {
    const t = tilesForBounds(bounds, z);
    total += (t.xMax - t.xMin + 1) * (t.yMax - t.yMin + 1);
  }
  return total;
}

// --- download primitives ---
async function ensureDir(dir: string) {
  const info = await FS.getInfoAsync(dir);
  if (!info.exists) {
    await FS.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  }
}

// writes to the exact bare-filename path; skips a tile already on disk so a
// re-download or an overlapping region is cheap. Returns true on success.
async function downloadTile(url: string, destUri: string): Promise<boolean> {
  const info = await FS.getInfoAsync(destUri);
  if (info.exists) return true;
  try {
    const res = await FS.downloadAsync(url, destUri, { headers: TILE_REQUEST_HEADERS });
    if (res.status >= 200 && res.status < 300) return true;
    // a non-2xx still writes a body (an error page) — remove it so offlineMode
    // never serves junk in place of a real tile.
    await FS.deleteAsync(destUri, { idempotent: true });
    return false;
  } catch {
    await FS.deleteAsync(destUri, { idempotent: true }).catch(() => {});
    return false;
  }
}

function baseTileUrl(z: number, x: number, y: number) {
  return BASE_TILE_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}
function depthTileUrl(z: number, x: number, y: number) {
  const b = tileBBox3857(x, y, z);
  return (
    `${DEPTH_EXPORT_BASE}?bbox=${b.minX},${b.minY},${b.maxX},${b.maxY}` +
    `&bboxSR=3857&imageSR=3857&size=256,256&dpi=96&format=png32&transparent=true&f=image`
  );
}

export type DownloadProgress = { done: number; total: number; failed: number };
export type DownloadResult = DownloadProgress & { cancelled: boolean };

export type DownloadOptions = {
  minZ: number;
  maxZ: number;
  includeDepth?: boolean; // also cache the depth layer (default true)
  onProgress?: (p: DownloadProgress) => void;
  shouldCancel?: () => boolean;
};

// Downloads every tile covering `bounds` across the zoom range. Base tiles are
// required; depth tiles are best-effort (a missing depth tile shouldn't fail the
// region). Runs a small worker pool, reports progress, and can be cancelled.
export async function downloadRegion(bounds: Bounds, opts: DownloadOptions): Promise<DownloadResult> {
  const { minZ, maxZ, includeDepth = true } = opts;

  // flatten every (z,x,y) into one task list so the worker pool can drain it
  const tiles: { z: number; x: number; y: number }[] = [];
  const columns = new Set<string>();
  for (let z = minZ; z <= maxZ; z++) {
    const t = tilesForBounds(bounds, z);
    for (let x = t.xMin; x <= t.xMax; x++) {
      columns.add(`${z}/${x}`);
      for (let y = t.yMin; y <= t.yMax; y++) tiles.push({ z, x, y });
    }
  }

  // pre-create every {z}/{x} directory up front so per-tile workers never race
  // on mkdir.
  for (const col of columns) {
    await ensureDir(`${BASE_TILE_CACHE}/${col}`);
    if (includeDepth) await ensureDir(`${DEPTH_TILE_CACHE}/${col}`);
  }

  const total = tiles.length;
  let done = 0;
  let failed = 0;
  let cancelled = false;
  let next = 0;

  async function worker() {
    while (true) {
      if (opts.shouldCancel?.()) {
        cancelled = true;
        return;
      }
      const i = next++;
      if (i >= tiles.length) return;
      const { z, x, y } = tiles[i];
      const okBase = await downloadTile(baseTileUrl(z, x, y), `${BASE_TILE_CACHE}/${z}/${x}/${y}`);
      if (includeDepth) {
        await downloadTile(depthTileUrl(z, x, y), `${DEPTH_TILE_CACHE}/${z}/${x}/${y}`);
      }
      if (!okBase) failed++;
      done++;
      opts.onProgress?.({ done, total, failed });
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker()));
  return { done, total, failed, cancelled };
}

// --- saved-region metadata (AsyncStorage) ---
export type OfflineRegion = {
  id: string;
  name: string;
  bounds: Bounds;
  minZ: number;
  maxZ: number;
  tiles: number;
  savedAt: string; // ISO
};

const REGIONS_KEY = 'narrows.offlineRegions';

export async function getRegions(): Promise<OfflineRegion[]> {
  try {
    const raw = await AsyncStorage.getItem(REGIONS_KEY);
    const list = raw ? (JSON.parse(raw) as OfflineRegion[]) : [];
    return list.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  } catch {
    return [];
  }
}

export async function addRegion(region: Omit<OfflineRegion, 'id' | 'savedAt'>): Promise<OfflineRegion> {
  const record: OfflineRegion = {
    ...region,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
  };
  try {
    const existing = await getRegions();
    await AsyncStorage.setItem(REGIONS_KEY, JSON.stringify([record, ...existing]));
  } catch {
    // ignore — the tiles are still on disk even if the metadata didn't save
  }
  return record;
}

// Removes a region's metadata only. Tiles are shared by (z/x/y) across
// overlapping regions, so deleting individual tiles here could break another
// saved region — use clearAllOfflineMaps() to actually reclaim disk space.
export async function removeRegion(id: string): Promise<void> {
  try {
    const existing = await getRegions();
    await AsyncStorage.setItem(REGIONS_KEY, JSON.stringify(existing.filter((r) => r.id !== id)));
  } catch {
    // ignore
  }
}

// total bytes used by all cached tiles (base + depth), via the new FS API which
// sums directory sizes recursively.
export async function getCacheSizeBytes(): Promise<number> {
  try {
    const dir = new Directory(ROOT);
    return dir.exists ? dir.size ?? 0 : 0;
  } catch {
    return 0;
  }
}

export async function clearAllOfflineMaps(): Promise<void> {
  try {
    const dir = new Directory(ROOT);
    if (dir.exists) dir.delete();
  } catch {
    // ignore
  }
  await AsyncStorage.removeItem(REGIONS_KEY).catch(() => {});
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export { OFFLINE_MAX_TILES };
