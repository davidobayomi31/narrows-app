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
let cachedMarina: Marina | null = null;
let cachedWeather: Weather | null = null;
let hasCached = false;

export async function loadHomeData(): Promise<{ marina: Marina | null; weather: Weather | null }> {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('marinas')
        .select('id, name, lake, address, phone, amenities, latitude, longitude, image_url, water_alert')
        .eq('featured', true)
        .single()
    );

    if (error || !data) throw error ?? new Error('no featured marina');

    const marina: Marina = data;
    let weather: Weather | null = null;
    if (data.latitude != null && data.longitude != null) {
      // weather is best-effort — a failure here shouldn't lose the marina
      weather = await withTimeout(getWeather(data.latitude, data.longitude)).catch(() => null);
    }

    cachedMarina = marina;
    cachedWeather = weather;
    hasCached = true;

    // persist so a later OFFLINE cold start can still show this
    await cacheSet(HOME_CACHE_KEY, { marina, weather });

    return { marina, weather };
  } catch {
    // offline or the request failed — fall back to the last data we saved
    const saved = await cacheGet<{ marina: Marina | null; weather: Weather | null }>(HOME_CACHE_KEY);
    cachedMarina = saved?.marina ?? null;
    cachedWeather = saved?.weather ?? null;
    hasCached = true;
    return { marina: cachedMarina, weather: cachedWeather };
  }
}

export function getCachedHomeData() {
  return { marina: cachedMarina, weather: cachedWeather, hasCached };
}
