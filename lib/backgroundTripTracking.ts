import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

// Background trip tracking — NOT usable in Expo Go (Location.startLocationUpdatesAsync
// requires a development build). Written now so it's ready the moment the dev build exists;
// nothing in this file is called from the app yet.

export const BACKGROUND_TRIP_TASK = 'narrows-background-trip-tracking';

TaskManager.defineTask(BACKGROUND_TRIP_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('Background trip task error:', error);
    return;
  }
  const { locations } = data as { locations: Location.LocationObject[] };
  const latest = locations[locations.length - 1];
  if (latest) {
    appendBackgroundPoint(latest.coords.latitude, latest.coords.longitude, latest.timestamp);
  }
});

// Points collected while the app was backgrounded — merged into the trip's
// distance total when the trip ends. Reset on each startBackgroundTracking call.
let backgroundPoints: { latitude: number; longitude: number; timestamp: number }[] = [];

function appendBackgroundPoint(latitude: number, longitude: number, timestamp: number) {
  backgroundPoints.push({ latitude, longitude, timestamp });
}

export function takeBackgroundPoints() {
  const points = backgroundPoints;
  backgroundPoints = [];
  return points;
}

export async function startBackgroundTripTracking() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false;

  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') return false;

  backgroundPoints = [];
  await Location.startLocationUpdatesAsync(BACKGROUND_TRIP_TASK, {
    accuracy: Location.Accuracy.High,
    distanceInterval: 15,
    timeInterval: 10000,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Narrows is tracking your trip',
      notificationBody: 'Tap to return to the app.',
    },
  });
  return true;
}

export async function stopBackgroundTripTracking() {
  const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TRIP_TASK);
  if (started) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_TRIP_TASK);
  }
}
