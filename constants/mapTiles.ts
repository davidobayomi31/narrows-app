// Configuration for the offline map base layer.
//
// Offline maps download raster tiles from BASE_TILE_URL into an on-device cache
// so the map — base + depth shading — keeps working with no signal on the water.
// Apple/Google's own base tiles CANNOT be cached or served offline through
// react-native-maps, which is why offline mode renders this raster layer instead
// (via <UrlTile shouldReplaceMapContent>).
//
// Provider: MapTiler (its plan permits offline caching, unlike OSM's public
// server). To finish setup:
//   1. Create a free key at https://cloud.maptiler.com/account/keys/
//   2. Paste it into MAPTILER_KEY below.
//   3. (Recommended) In MapTiler → your key → restrict it to this app's bundle
//      id (site.narrows.app) so the key can't be abused elsewhere.
// Until a key is set, BASE_TILE_URL falls back to OpenStreetMap for DEV TESTING
// ONLY — OSM's usage policy forbids bulk downloading, so never ship on it.
export const MAPTILER_KEY = 'jzXHqJHLVGiZXw1REBsY'; // MapTiler client key (bundled in-app; see notes on restriction)

// Raster base style. 'ocean' is marine-oriented (depth tints, seamarks) and fits
// boating best; 'outdoor-v2' and 'topo-v2' are good alternatives. All are served
// as {z}/{x}/{y}.png raster by MapTiler.
const MAPTILER_STYLE = 'ocean';

export const BASE_TILE_URL = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/${MAPTILER_STYLE}/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`
  : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'; // DEV fallback — do not ship

// The offline base raster layer only turns on once a real provider key is set,
// so we never ship region prefetch against OSM by accident. Flip to `true` to
// force-enable the OSM fallback for local testing.
export const BASE_TILES_ENABLED = MAPTILER_KEY.length > 0;

// Sent on every tile request. OSM (and most providers) want a descriptive
// User-Agent identifying the app; requests with a generic RN user-agent may be
// throttled or blocked.
export const TILE_REQUEST_HEADERS: Record<string, string> = {
  'User-Agent': 'NarrowsApp/1.0 (+https://narrows.site)',
};

// MapTiler's terms require this attribution wherever their tiles are shown (we
// display it in the offline badge). Falls back to OSM's when no key is set.
export const BASE_TILE_ATTRIBUTION = MAPTILER_KEY
  ? '© MapTiler © OpenStreetMap contributors'
  : '© OpenStreetMap contributors';

// Zoom range prefetched for a downloaded region. The low bound frames the whole
// lake; the high bound is close-in detail. Each extra zoom level is ~4× the
// tiles, so keep the ceiling modest for storage's sake.
export const OFFLINE_MIN_ZOOM = 9;
export const OFFLINE_MAX_ZOOM = 15;

// Hard ceiling so a zoomed-out selection can't try to pull 100k+ tiles at once.
export const OFFLINE_MAX_TILES = 8000;
