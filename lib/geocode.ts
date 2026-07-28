// Place search via Open-Meteo's free geocoding API (no key — same provider we
// already use for weather). Used by the map search box to jump to a town/place.
// Fails silently to an empty list (e.g. offline), so the caller falls back to
// local marina matches.

export type Place = {
  id: string;
  name: string;
  detail: string; // e.g. "Ontario, CA"
  latitude: number;
  longitude: number;
};

export async function searchPlaces(query: string): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const url =
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}` +
      `&count=5&language=en&format=json`;
    const res = await fetch(url);
    const json = await res.json();
    return (json?.results ?? []).map((r: any) => ({
      id: `place-${r.id}`,
      name: r.name,
      detail: [r.admin1, r.country_code].filter(Boolean).join(', '),
      latitude: r.latitude,
      longitude: r.longitude,
    }));
  } catch {
    return [];
  }
}
