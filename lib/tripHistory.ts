import AsyncStorage from '@react-native-async-storage/async-storage';

// Local history of finished trips, so users can revisit a past trip's route
// (the "squiggly line" drawn on the water) from Settings → My Trips, then post
// or share it. Stored on-device only — trips are personal and this keeps the
// feature working fully offline. Everything fails silently: a read/write error
// should never break the Trips screen, it just means an empty or older list.

const STORAGE_KEY = 'narrows.trips';
// keep storage bounded — the most recent trips are what people revisit
const MAX_TRIPS = 100;
// cap points per trip so a very long trip can't bloat AsyncStorage; the route
// still reads fine visually when downsampled to this many points.
const MAX_POINTS = 2000;

export type TripCoord = { latitude: number; longitude: number };

export type TripRecord = {
  id: string;
  started_at: string; // ISO
  ended_at: string; // ISO
  duration_hours: number;
  distance_km: number;
  path: TripCoord[]; // ordered GPS breadcrumb of the route
};

// even-stride downsample so a huge path collapses to <= MAX_POINTS while keeping
// the first and last fixes (start/end markers) and the overall shape.
function downsample(path: TripCoord[]): TripCoord[] {
  if (path.length <= MAX_POINTS) return path;
  const stride = Math.ceil(path.length / MAX_POINTS);
  const out: TripCoord[] = [];
  for (let i = 0; i < path.length; i += stride) out.push(path[i]);
  const last = path[path.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export async function getTrips(): Promise<TripRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as TripRecord[]) : [];
    // newest first
    return list.sort((a, b) => b.started_at.localeCompare(a.started_at));
  } catch {
    return [];
  }
}

export async function getTrip(id: string): Promise<TripRecord | null> {
  const trips = await getTrips();
  return trips.find((t) => t.id === id) ?? null;
}

export async function saveTrip(
  trip: Omit<TripRecord, 'id' | 'path'> & { path: TripCoord[] }
): Promise<TripRecord> {
  const record: TripRecord = {
    ...trip,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    path: downsample(trip.path),
  };
  try {
    const existing = await getTrips();
    const next = [record, ...existing].slice(0, MAX_TRIPS);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore — an unsaved trip just won't appear in history
  }
  return record;
}

export async function deleteTrip(id: string): Promise<void> {
  try {
    const existing = await getTrips();
    const next = existing.filter((t) => t.id !== id);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}
