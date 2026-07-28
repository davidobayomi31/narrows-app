# Narrows — Project Memory

> A living context file for Claude sessions. Skim this first when starting a new chat.
> **Keep it updated:** when something meaningful changes (a feature ships, a decision is made,
> a constraint appears), edit the relevant section and bump "Last updated".
>
> Last updated: 2026-07-28

---

## What Narrows is

A marina & waterway **navigation + social** app for **Simcoe County, Ontario** (Lake Simcoe,
Lake Couchiching, the Narrows, Sparrow Lake). Boaters check live conditions, discover marinas,
log trips and catches, drop community "catch pins", and see activity from other local boaters.

- **Platform:** React Native / Expo SDK 54, TypeScript. iOS-first (App Store submission in
  progress); Android configured too.
- **Backend:** Supabase (auth, Postgres, storage, edge functions).
- **Monetization plan:** ads targeted with signup data (boat ownership, region, experience).

## Competitive direction (important)

We're positioning against **Wavve Boating** (a generic global marine-nav chartplotter app).
**We do not try to out-chart Wavve** — their moat is licensed nationwide chart/tide data we
can't match. Our wedge is the opposite of theirs:

- **Hyper-local** to Simcoe County (deep, not wide).
- **Social + community** (catch pins, trips, marina community) — things a solo-nav app can't do.
- **We already have free depth data** (Simcoe County bathymetry) and know the user's boat.

Goal isn't "beat Wavve everywhere" — it's "make Wavve pointless for a Simcoe County boater."

## Map feature roadmap (the current big push)

| # | Feature | Status |
|---|---------|--------|
| 1 | Depth-shading layer (whole-water color, not just a point) | ✅ built |
| 2 | Draft-aware shallow-water alert (buzz + banner) | ✅ built |
| 3 | Trip track recording + "My Trips" (route line, post to feed, share) | ✅ built |
| 4 | Offline maps (download areas; base + depth work with no signal) | ✅ built |
| 5 | Live conditions on the map as a drag-up **bottom sheet** | ✅ built (`screens/components/ConditionsSheet.tsx`) |
| 6 | Marker **clustering** + **place/marina search** | ⏳ agreed, not started |

Notes:
- #5 is a **bottom sheet** (NOT a left-edge drawer — conflicts with iOS back-swipe), built on core
  `Animated` + `PanResponder` (no gesture-handler dep). Reuses `lib/weather.ts` + `WindCompass`.
  Shows wind/gust/direction, temp/feels-like, precip, humidity, UV, sunrise. **No wave height** —
  Open-Meteo's marine API doesn't cover inland lakes; revisit if an inland wave source appears.
- Known nit: when expanded, the sheet overlaps the Start Trip button / depth readout (collapse to
  interact). Fine for MVP; could add a scrim or shift controls later.

## Depth data (features #1, #2, #4)

- Source: **Simcoe County bathymetry**, ArcGIS cached MapServer:
  `https://maps.simcoe.ca/arcgis/rest/services/Public/Bathymetry_Cache/MapServer`
- **Gotcha:** its tile cache levels are numbered **0–11** but map to web-mercator zoom **9–20**
  (offset of 9). A plain `{z}/{x}/{y}` UrlTile requests non-existent levels → blank. We render it
  via `<WMSTile>` against the **`export`** endpoint (bbox-based, immune to the offset). WMS proper
  is disabled on the service; `export` works.
- Always show the attribution + "reference only, not for navigation" disclaimer when depth is shown.

## Offline maps (feature #4)

- **Base map provider: MapTiler** (chosen because its plan permits offline caching; OSM's public
  server forbids bulk download). Config: `constants/mapTiles.ts`. Key is in `MAPTILER_KEY`, style
  `MAPTILER_STYLE` (default `ocean`; `outdoor-v2`/`topo-v2` are fallbacks).
- **Why not Apple/Google base offline:** their base tiles can't be cached/served offline via
  react-native-maps. We render a MapTiler `<UrlTile shouldReplaceMapContent>` instead.
- **How it works:** `<UrlTile>`/`<WMSTile>` cache tiles to `tileCachePath` as `{cache}/{z}/{x}/{y}`
  (bare filename — verified against native source, iOS + Android). `offlineMode={true}` serves
  cache-only. The download engine (`lib/offlineTiles.ts`) prefetches base + depth tiles for a bbox
  into that exact layout.
- **Decision (2026-07-28):** online base stays **native Apple/Google** (no MapTiler quota, online
  look unchanged); MapTiler is used **only for offline** (download + offline serving). Populate the
  offline cache with "download this area" while online. Depth layer still caches online (county
  server, free) + offline. Revisit if the offline (MapTiler) look feels too different from online —
  the alternative is MapTiler (or self-hosted/MapLibre) everywhere for a consistent look. See the
  long provider discussion: raster self-host = region-only; worldwide self-host needs MapLibre+Protomaps.
- **Requires the dev build, not Expo Go** (tile caching is native).
- Manage saved areas: Settings → Offline Maps.

## Key files

- `screens/MapScreen.tsx` — the map: depth layer, shallow alert, speed, trip start/end, offline
  toggle + "download this area" + progress.
- `contexts/TripContext.tsx` — trip tracking; now records the GPS **path** and saves finished trips.
- `lib/tripHistory.ts` — local (AsyncStorage) trip history (route + stats).
- `screens/TripsScreen.tsx` / `TripDetailScreen.tsx` — My Trips list + route detail (post/share).
- `lib/offlineTiles.ts` — offline tile engine (tile math, prefetch, regions, size, clear).
- `constants/mapTiles.ts` — MapTiler key/style/attribution + offline zoom/limits.
- `screens/OfflineMapsScreen.tsx` — manage/clear downloaded areas.
- `contexts/UnitsContext.tsx` — units + depth mode + shallow-alert threshold (persisted).

## Conventions & gotchas

- Expo SDK 54 is pinned — **do not upgrade** (see `AGENTS.md`); read versioned Expo docs before
  writing native-facing code.
- `expo-file-system` v54 split its API: new `File`/`Directory`/`Paths` vs `expo-file-system/legacy`.
  The offline engine uses **legacy** `downloadAsync` for exact-path writes and the **new** `Directory`
  for recursive size/delete.
- Colors: `constants/colors.ts` (black bg, cream text, gold accent).
- Everything network-facing should degrade gracefully offline (see `lib/cache.ts` patterns).

## Needs on-device verification (can't run sim from Claude here)

- Depth shading renders on Apple Maps; shallow-alert vibration fires; trip share sheet gets the image.
- Offline: run a real area download → airplane mode → toggle offline → confirm base + depth render.
- MapTiler `ocean` style renders (else switch `MAPTILER_STYLE` to `outdoor-v2`).
