import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// All trip data is STORED in metric (km, hours) in the database. These units
// only change how it's DISPLAYED. Toggling here updates the whole app instantly.
export type DistanceUnit = 'km' | 'mi';
export type TimeUnit = 'hours' | 'minutes';

const KM_TO_MI = 0.621371;
const STORAGE_KEY = 'narrows.units';

type UnitsContextValue = {
  distanceUnit: DistanceUnit;
  timeUnit: TimeUnit;
  setDistanceUnit: (u: DistanceUnit) => void;
  setTimeUnit: (u: TimeUnit) => void;
  // formatters — pass the raw metric value stored in the DB
  formatDistance: (km: number) => string;
  formatDuration: (hours: number) => string;
  // raw converted numbers (no unit label) + the label, for stat cells
  distanceValue: (km: number) => number;
  durationValue: (hours: number) => number;
  distanceLabel: string; // 'km' | 'mi'
  timeLabel: string; // 'Hours' | 'Min'
};

const UnitsContext = createContext<UnitsContextValue | undefined>(undefined);

function round(n: number, dp = 1) {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

export function UnitsProvider({ children }: { children: ReactNode }) {
  const [distanceUnit, setDistanceUnitState] = useState<DistanceUnit>('km');
  const [timeUnit, setTimeUnitState] = useState<TimeUnit>('hours');

  // load saved preference once on startup
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.distanceUnit) setDistanceUnitState(saved.distanceUnit);
          if (saved.timeUnit) setTimeUnitState(saved.timeUnit);
        }
      } catch {
        // ignore — fall back to defaults
      }
    })();
  }, []);

  async function persist(next: { distanceUnit: DistanceUnit; timeUnit: TimeUnit }) {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore — the in-memory value still updates the UI
    }
  }

  function setDistanceUnit(u: DistanceUnit) {
    setDistanceUnitState(u);
    persist({ distanceUnit: u, timeUnit });
  }

  function setTimeUnit(u: TimeUnit) {
    setTimeUnitState(u);
    persist({ distanceUnit, timeUnit: u });
  }

  function distanceValue(km: number) {
    return distanceUnit === 'mi' ? round(km * KM_TO_MI) : round(km);
  }

  function durationValue(hours: number) {
    return timeUnit === 'minutes' ? Math.round(hours * 60) : round(hours);
  }

  function formatDistance(km: number) {
    return `${distanceValue(km)} ${distanceUnit}`;
  }

  function formatDuration(hours: number) {
    return timeUnit === 'minutes' ? `${durationValue(hours)} min` : `${durationValue(hours)}h`;
  }

  const value: UnitsContextValue = {
    distanceUnit,
    timeUnit,
    setDistanceUnit,
    setTimeUnit,
    formatDistance,
    formatDuration,
    distanceValue,
    durationValue,
    distanceLabel: distanceUnit,
    timeLabel: timeUnit === 'minutes' ? 'Min' : 'Hours',
  };

  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
}

export function useUnits() {
  const ctx = useContext(UnitsContext);
  if (!ctx) throw new Error('useUnits must be used inside <UnitsProvider>');
  return ctx;
}
