// All weather logic lives here. The rest of the app calls getWeather() and gets
// back OUR shape — so we can swap Open-Meteo for any provider later by editing
// only this file. Includes a 15-min in-memory cache to cut API calls.

//  The clean shapes the app consumes (provider-agnostic) 
export type WeatherDay = {
  label: string;   // 'Mon'
  icon: string;    // a MaterialCommunityIcons name, e.g. 'weather-sunny'
  high: number;    // °C
  low: number;     // °C
};

export type Weather = {
  windSpeed: number;     // km/h
  windGust: number;      // km/h
  temp: number;          // °C
  precipitation: number; // mm
  humidity: number;      // %
  sunrise: string;       // '6:02 AM'
  sunset: string;        // '8:54 PM'
  windDirection: number; // degrees the wind is coming FROM (0=N, 90=E …)
  feelsLike: number;     // °C apparent temperature
  uvIndex: number;       // 0–11+
  week: WeatherDay[];     // 7 days
};

//  Map WMO weather codes -> a vector icon name 
function codeToIcon(code: number): string {
  if (code === 0) return 'weather-sunny';
  if (code === 1 || code === 2) return 'weather-partly-cloudy';
  if (code === 3) return 'weather-cloudy';
  if (code === 45 || code === 48) return 'weather-fog';
  if (code >= 51 && code <= 57) return 'weather-rainy';
  if (code >= 61 && code <= 67) return 'weather-pouring';
  if (code >= 71 && code <= 77) return 'weather-snowy';
  if (code >= 80 && code <= 82) return 'weather-rainy';
  if (code >= 85 && code <= 86) return 'weather-snowy';
  if (code >= 95) return 'weather-lightning';
  return 'weather-cloudy';
}

// ---- Helpers to format the raw API values into display strings ----
function formatTime(iso: string): string {
  // iso like '2026-06-22T06:02' -> '6:02 AM'
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function dayLabel(iso: string): string {
  // '2026-06-22' -> 'Mon'
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

// ---- Simple 15-minute cache, keyed by location ----
const cache = new Map<string, { data: Weather; time: number }>();
const TTL = 15 * 60 * 1000; // 15 minutes in ms

export async function getWeather(lat: number, lng: number): Promise<Weather | null> {
  const key = `${lat},${lng}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < TTL) {
    return hit.data; // fresh enough — skip the network
  }

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m,apparent_temperature,uv_index` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset` +
    `&timezone=auto&forecast_days=7`;

  try {
    const res = await fetch(url);
    const json = await res.json();

    // Translate Open-Meteo's shape into OUR shape:
    const data: Weather = {
      windSpeed: Math.round(json.current.wind_speed_10m),
      windGust: Math.round(json.current.wind_gusts_10m),
      temp: Math.round(json.current.temperature_2m),
      precipitation: json.current.precipitation,
      humidity: Math.round(json.current.relative_humidity_2m),
      sunrise: formatTime(json.daily.sunrise[0]), // today's sunrise
      sunset: formatTime(json.daily.sunset[0]),   // today's sunset
      windDirection: Math.round(json.current.wind_direction_10m),
      feelsLike: Math.round(json.current.apparent_temperature),
      uvIndex: Math.round(json.current.uv_index),
      week: json.daily.time.map((date: string, i: number) => ({
        label: dayLabel(date),
        icon: codeToIcon(json.daily.weather_code[i]),
        high: Math.round(json.daily.temperature_2m_max[i]),
        low: Math.round(json.daily.temperature_2m_min[i]),
      })),
    };

    cache.set(key, { data, time: Date.now() });
    return data;
  } catch {
    return null; // network/parse failure — caller shows a fallback
  }
}