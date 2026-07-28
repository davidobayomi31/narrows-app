// Configuration for the offline map base layer.
//
// Offline maps download raster tiles from BASE_TILE_URL into an on-device cache
// so the map — base + depth shading — keeps working with no signal on the water.
// Apple/Google's own base tiles CANNOT be cached or served offline through
// react-native-maps, which is why offline mode renders this raster layer instead
// (via <UrlTile shouldReplaceMapContent>).
//
// ⚠️ PROVIDER / TERMS OF SERVICE
// The default below is OpenStreetMap's public tile server. It is fine for light
// development testing, but its usage policy FORBIDS bulk downloading — do not
// ship region prefetch against it. Before release, switch BASE_TILE_URL to a
// provider whose plan permits offline/caching and hand back an {z}/{x}/{y} raster
// URL with an API key (MapTiler, Stadia Maps, and Thunderforest all have free
// tiers). Update BASE_TILE_ATTRIBUTION to match whatever you choose.
export const BASE_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

// Whether the offline base raster layer is active. Kept as its own flag so the
// map falls back cleanly to Apple/Google online tiles until a shippable provider
// is configured above.
export const BASE_TILES_ENABLED = true;

// Sent on every tile request. OSM (and most providers) require a descriptive
// User-Agent identifying the app; requests with a generic RN user-agent may be
// throttled or blocked.
export const TILE_REQUEST_HEADERS: Record<string, string> = {
  'User-Agent': 'NarrowsApp/1.0 (+https://narrows.site)',
};

export const BASE_TILE_ATTRIBUTION = '© OpenStreetMap contributors';

// Zoom range prefetched for a downloaded region. The low bound frames the whole
// lake; the high bound is close-in detail. Each extra zoom level is ~4× the
// tiles, so keep the ceiling modest for storage's sake.
export const OFFLINE_MIN_ZOOM = 9;
export const OFFLINE_MAX_ZOOM = 15;

// Hard ceiling so a zoomed-out selection can't try to pull 100k+ tiles at once.
export const OFFLINE_MAX_TILES = 8000;
