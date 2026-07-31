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

export type VerifiedAddress = {
  formatted: string;
  latitude: number;
  longitude: number;
};

// Validates a free-typed street address via OpenStreetMap's free Nominatim
// geocoder (no key). Used to block tow requests from being submitted with a
// vague or made-up address — a marina dispatching a tow needs a real place
// to send it. Requires the match to include a house_number component (not
// just a town/road hit) to count as "verified". One user-triggered lookup
// per submit attempt, well under Nominatim's ~1 req/sec usage policy.
export async function verifyAddress(query: string): Promise<VerifiedAddress | null> {
  const q = query.trim();
  if (q.length < 5) return null;
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1` +
      `&countrycodes=ca&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'NarrowsApp/1.0 (hello@narrows.site)' },
    });
    const json = await res.json();
    const hit = json?.[0];
    if (!hit?.address?.house_number) return null; // no exact street match
    return {
      formatted: hit.display_name,
      latitude: parseFloat(hit.lat),
      longitude: parseFloat(hit.lon),
    };
  } catch {
    return null;
  }
}
