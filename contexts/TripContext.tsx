import { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { distanceKm } from '../lib/tripTracking';
import {
  startBackgroundTripTracking,
  stopBackgroundTripTracking,
  takeBackgroundPoints,
} from '../lib/backgroundTripTracking';

type TripResult = { duration_hours: number; distance_km: number };

type TripContextValue = {
  isTracking: boolean;
  elapsedSeconds: number;
  distanceKm: number;
  startTrip: () => Promise<boolean>;
  endTrip: () => TripResult;
};

const TripContext = createContext<TripContextValue | null>(null);

export function TripProvider({ children }: { children: React.ReactNode }) {
  const [isTracking, setIsTracking] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [distance, setDistance] = useState(0);

  const startTimeRef = useRef<number>(0);
  const lastCoordRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const distanceRef = useRef(0);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isTrackingRef = useRef(false);

  // Foreground location updates pause once the app backgrounds, so a separate
  // background task (lib/backgroundTripTracking.ts) takes over while backgrounded
  // and its points get merged back in here when the app returns to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (!isTrackingRef.current) return;

      if (nextState === 'background') {
        await startBackgroundTripTracking();
      } else if (nextState === 'active') {
        await stopBackgroundTripTracking();
        const points = takeBackgroundPoints();

        let last = lastCoordRef.current;
        for (const point of points) {
          const coord = { latitude: point.latitude, longitude: point.longitude };
          if (last) {
            distanceRef.current += distanceKm(last, coord);
          }
          last = coord;
        }
        lastCoordRef.current = last;
        setDistance(distanceRef.current);
      }
    });

    return () => sub.remove();
  }, []);

  const startTrip = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return false;

    startTimeRef.current = Date.now();
    lastCoordRef.current = null;
    distanceRef.current = 0;
    setDistance(0);
    setElapsedSeconds(0);

    subscriptionRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000 },
      (loc) => {
        const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        if (lastCoordRef.current) {
          distanceRef.current += distanceKm(lastCoordRef.current, coord);
          setDistance(distanceRef.current);
        }
        lastCoordRef.current = coord;
      }
    );

    tickRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    isTrackingRef.current = true;
    setIsTracking(true);
    return true;
  }, []);

  const endTrip = useCallback((): TripResult => {
    isTrackingRef.current = false;
    stopBackgroundTripTracking();
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;

    const duration_hours = (Date.now() - startTimeRef.current) / 1000 / 3600;
    const distance_km = distanceRef.current;

    setIsTracking(false);
    setElapsedSeconds(0);
    setDistance(0);

    return {
      duration_hours: Math.round(duration_hours * 100) / 100,
      distance_km: Math.round(distance_km * 100) / 100,
    };
  }, []);

  return (
    <TripContext.Provider value={{ isTracking, elapsedSeconds, distanceKm: distance, startTrip, endTrip }}>
      {children}
    </TripContext.Provider>
  );
}

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used within a TripProvider');
  return ctx;
}
