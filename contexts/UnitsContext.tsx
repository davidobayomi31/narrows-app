import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// All trip data is STORED in metric (km, hours) in the database. These units
// only change how it's DISPLAYED. Toggling here updates the whole app instantly.
export type DistanceUnit = 'km' | 'mi';
export type TimeUnit = 'hours' | 'minutes';
// speed is read live from GPS in metres/second; these are display choices.
export type SpeedUnit = 'kmh' | 'mph' | 'kn';
// where the Map's depth readout measures: at the boat ('location', the default)
// or at the map's centre crosshair ('map'), which lets you scout other spots.
export type DepthMode = 'location' | 'map';

const KM_TO_MI = 0.621371;
// metres-per-second → display unit
const MS_TO_KMH = 3.6;
const MS_TO_MPH = 2.236936;
const MS_TO_KN = 1.943844;
// GPS speed is jittery when nearly stationary (just holding/moving the phone
// registers a few km/h). Suppress anything under this floor so the readout
// stays at 0 until the boat is actually moving. 6 km/h ≈ 1.667 m/s.
const SPEED_FLOOR_MPS = 6 / MS_TO_KMH;
const STORAGE_KEY = 'narrows.units';
// sensible starting threshold — ~1.2 m under the hull covers most small
// recreational boats; the user tunes it to their own draft in Settings.
const DEFAULT_SHALLOW_ALERT_DEPTH_M = 1.2;

type UnitsContextValue = {
  distanceUnit: DistanceUnit;
  timeUnit: TimeUnit;
  speedUnit: SpeedUnit;
  depthMode: DepthMode;
  // shallow-water alert: buzz + banner when the depth under the boat drops below
  // shallowAlertDepthM (metres). Off by default; the user sets a threshold that
  // suits their boat's draft.
  shallowAlertEnabled: boolean;
  shallowAlertDepthM: number;
  setDistanceUnit: (u: DistanceUnit) => void;
  setTimeUnit: (u: TimeUnit) => void;
  setSpeedUnit: (u: SpeedUnit) => void;
  setDepthMode: (m: DepthMode) => void;
  setShallowAlertEnabled: (v: boolean) => void;
  setShallowAlertDepthM: (m: number) => void;
  // formatters — pass the raw metric value stored in the DB
  formatDistance: (km: number) => string;
  formatDuration: (hours: number) => string;
  // speed comes straight from GPS in metres/second (may be null/negative when unknown)
  formatSpeed: (metersPerSecond: number | null | undefined) => string;
  // raw converted numbers (no unit label) + the label, for stat cells
  distanceValue: (km: number) => number;
  durationValue: (hours: number) => number;
  distanceLabel: string; // 'km' | 'mi'
  timeLabel: string; // 'Hours' | 'Min'
  speedLabel: string; // 'km/h' | 'mph' | 'kn'
};

const UnitsContext = createContext<UnitsContextValue | undefined>(undefined);

function round(n: number, dp = 1) {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

export function UnitsProvider({ children }: { children: ReactNode }) {
  const [distanceUnit, setDistanceUnitState] = useState<DistanceUnit>('km');
  const [timeUnit, setTimeUnitState] = useState<TimeUnit>('hours');
  const [speedUnit, setSpeedUnitState] = useState<SpeedUnit>('kmh');
  const [depthMode, setDepthModeState] = useState<DepthMode>('location');
  const [shallowAlertEnabled, setShallowAlertEnabledState] = useState(false);
  const [shallowAlertDepthM, setShallowAlertDepthMState] = useState(DEFAULT_SHALLOW_ALERT_DEPTH_M);

  // load saved preference once on startup
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.distanceUnit) setDistanceUnitState(saved.distanceUnit);
          if (saved.timeUnit) setTimeUnitState(saved.timeUnit);
          if (saved.speedUnit) setSpeedUnitState(saved.speedUnit);
          if (saved.depthMode) setDepthModeState(saved.depthMode);
          if (typeof saved.shallowAlertEnabled === 'boolean') setShallowAlertEnabledState(saved.shallowAlertEnabled);
          if (typeof saved.shallowAlertDepthM === 'number') setShallowAlertDepthMState(saved.shallowAlertDepthM);
        }
      } catch {
        // ignore — fall back to defaults
      }
    })();
  }, []);

  // one snapshot writer — each setter updates its own field then persists the
  // whole preferences object (with the just-changed value overridden).
  async function persist(overrides: Partial<{
    distanceUnit: DistanceUnit;
    timeUnit: TimeUnit;
    speedUnit: SpeedUnit;
    depthMode: DepthMode;
    shallowAlertEnabled: boolean;
    shallowAlertDepthM: number;
  }>) {
    try {
      const next = {
        distanceUnit,
        timeUnit,
        speedUnit,
        depthMode,
        shallowAlertEnabled,
        shallowAlertDepthM,
        ...overrides,
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore — the in-memory value still updates the UI
    }
  }

  function setDistanceUnit(u: DistanceUnit) {
    setDistanceUnitState(u);
    persist({ distanceUnit: u });
  }

  function setTimeUnit(u: TimeUnit) {
    setTimeUnitState(u);
    persist({ timeUnit: u });
  }

  function setSpeedUnit(u: SpeedUnit) {
    setSpeedUnitState(u);
    persist({ speedUnit: u });
  }

  function setDepthMode(m: DepthMode) {
    setDepthModeState(m);
    persist({ depthMode: m });
  }

  function setShallowAlertEnabled(v: boolean) {
    setShallowAlertEnabledState(v);
    persist({ shallowAlertEnabled: v });
  }

  // clamp to a sane range so the stepper can't drive it to 0 or absurd depths
  function setShallowAlertDepthM(m: number) {
    const clamped = Math.min(15, Math.max(0.5, Math.round(m * 10) / 10));
    setShallowAlertDepthMState(clamped);
    persist({ shallowAlertDepthM: clamped });
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

  const speedLabel = speedUnit === 'mph' ? 'mph' : speedUnit === 'kn' ? 'kn' : 'km/h';

  function formatSpeed(metersPerSecond: number | null | undefined) {
    // GPS reports null (or a negative sentinel) when speed is unavailable/stationary.
    // Below the floor, hold at 0 so noise near standstill doesn't flicker.
    const raw = metersPerSecond != null && metersPerSecond > 0 ? metersPerSecond : 0;
    const mps = raw < SPEED_FLOOR_MPS ? 0 : raw;
    const factor = speedUnit === 'mph' ? MS_TO_MPH : speedUnit === 'kn' ? MS_TO_KN : MS_TO_KMH;
    return `${round(mps * factor, 0)} ${speedLabel}`;
  }

  const value: UnitsContextValue = {
    distanceUnit,
    timeUnit,
    speedUnit,
    depthMode,
    shallowAlertEnabled,
    shallowAlertDepthM,
    setDistanceUnit,
    setTimeUnit,
    setSpeedUnit,
    setDepthMode,
    setShallowAlertEnabled,
    setShallowAlertDepthM,
    formatDistance,
    formatDuration,
    formatSpeed,
    distanceValue,
    durationValue,
    distanceLabel: distanceUnit,
    timeLabel: timeUnit === 'minutes' ? 'Min' : 'Hours',
    speedLabel,
  };

  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
}

export function useUnits() {
  const ctx = useContext(UnitsContext);
  if (!ctx) throw new Error('useUnits must be used inside <UnitsProvider>');
  return ctx;
}
