import { supabase } from './supabase';
import { getWeather, Weather } from './weather';
import { cacheGet, cacheSet, withTimeout } from './cache';

const HOME_CACHE_KEY = 'home';

export type Marina = {
  id: string;
  name: string;
  lake: string | null;
  address: string | null;
  phone: string | null;
  amenities: string[] | null;
  latitude: number | null;
  longitude: number | null;
  image_url: string | null;
  water_alert: string | null;
};

// in-memory cache for the current app session, so Splash can prefetch this
// data and Home doesn't need to show its own loading state right after.
// A LIST now, not one marina — Home shows a swipeable carousel across every
// marina with `featured = true` (still the same curation flag as before,
// just no longer capped at exactly one row via `.single()`).
let cachedMarinas: Marina[] = [];
let cachedWeather: Weather | null = null;
let hasCached = false;

export async function loadHomeData(): Promise<{ marinas: Marina[]; weather: Weather | null }> {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('marinas')
        .select('id, name, lake, address, phone, amenities, latitude, longitude, image_url, water_alert')
        .eq('featured', true)
        .order('created_at', { ascending: true })
    );

    if (error || !data || data.length === 0) throw error ?? new Error('no featured marinas');

    const marinas: Marina[] = data;
    let weather: Weather | null = null;
    // weather is best-effort, for the first (default-shown) marina only —
    // Homepage re-fetches for whichever marina is actively swiped to.
    if (marinas[0].latitude != null && marinas[0].longitude != null) {
      weather = await withTimeout(getWeather(marinas[0].latitude, marinas[0].longitude)).catch(() => null);
    }

    cachedMarinas = marinas;
    cachedWeather = weather;
    hasCached = true;

    // persist so a later OFFLINE cold start can still show this
    await cacheSet(HOME_CACHE_KEY, { marinas, weather });

    return { marinas, weather };
  } catch {
    // offline or the request failed — fall back to the last data we saved
    const saved = await cacheGet<{ marinas: Marina[]; weather: Weather | null }>(HOME_CACHE_KEY);
    cachedMarinas = saved?.marinas ?? [];
    cachedWeather = saved?.weather ?? null;
    hasCached = true;
    return { marinas: cachedMarinas, weather: cachedWeather };
  }
}

export function getCachedHomeData() {
  return { marinas: cachedMarinas, weather: cachedWeather, hasCached };
}
