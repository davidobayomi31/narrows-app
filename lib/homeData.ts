import { supabase } from './supabase';
import { getWeather, Weather } from './weather';

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
  const { data, error } = await supabase
    .from('marinas')
    .select('id, name, lake, address, phone, amenities, latitude, longitude, image_url, water_alert')
    .eq('featured', true)
    .single();

  let marina: Marina | null = null;
  let weather: Weather | null = null;

  if (!error && data) {
    marina = data;
    if (data.latitude != null && data.longitude != null) {
      weather = await getWeather(data.latitude, data.longitude);
    }
  }

  cachedMarina = marina;
  cachedWeather = weather;
  hasCached = true;

  return { marina, weather };
}

export function getCachedHomeData() {
  return { marina: cachedMarina, weather: cachedWeather, hasCached };
}
