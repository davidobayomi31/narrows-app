import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Vibration,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import MapView, { Marker, LongPressEvent, Callout, UrlTile } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import DismissKeyboardView from './components/DismissKeyboardView';
import { supabase } from '../lib/supabase';
import { cacheGet, cacheSet, withTimeout } from '../lib/cache';
import { friendlyError } from '../lib/errors';
import { Ionicons } from '@expo/vector-icons';
import { useTrip } from '../contexts/TripContext';
import { useUnits } from '../contexts/UnitsContext';
import PostComposer from './components/PostComposer';
import ConditionsSheet from './components/ConditionsSheet';
import { getWeather, Weather } from '../lib/weather';
import { clusterPoints, Region } from '../lib/clustering';
import { searchPlaces, Place } from '../lib/geocode';
import {
  BASE_TILE_URL,
  BASE_TILES_ENABLED,
  BASE_TILE_ATTRIBUTION,
  OFFLINE_MIN_ZOOM,
  OFFLINE_MAX_ZOOM,
  OFFLINE_MAX_TILES,
} from '../constants/mapTiles';
import {
  BASE_TILE_CACHE,
  downloadRegion,
  estimateTileCount,
  addRegion,
  DownloadProgress,
} from '../lib/offlineTiles';

type MarinaPin = {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
};

type CatchPin = {
  id: string;
  latitude: number;
  longitude: number;
  species: string | null;
  notes: string | null;
  user_id: string;
  created_at: string;
  author?: { first_name: string | null; last_name: string | null };
};

// Point water-depth lookup via Simcoe County's bathymetry raster "identify".
// Returns metres below the surface (positive), or null when off-water / no data.
// Data © County of Simcoe, Open Government Licence – Simcoe County. Reference only.
const DEPTH_IDENTIFY =
  'https://maps.simcoe.ca/arcgis/rest/services/Public/Bathymetry_Cache/MapServer/identify';

async function fetchDepthMeters(lat: number, lon: number): Promise<number | null> {
  const d = 0.01; // small bbox around the point so identify has a map extent
  const ext = `${lon - d},${lat - d},${lon + d},${lat + d}`;
  const url =
    `${DEPTH_IDENTIFY}?geometry=${lon},${lat}&geometryType=esriGeometryPoint&sr=4326` +
    `&layers=all:0&tolerance=1&mapExtent=${ext}&imageDisplay=400,400,96&returnGeometry=false&f=json`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    const raw = json?.results?.[0]?.attributes?.['Stretch.Pixel Value'];
    const val = parseFloat(raw);
    if (raw == null || raw === 'NoData' || Number.isNaN(val)) return null;
    return Math.abs(val); // stored as negative elevation below the surface
  } catch {
    return null;
  }
}

// metres between two coords, to throttle depth re-queries as the boat moves
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function formatDepth(meters: number, unit: 'km' | 'mi') {
  return unit === 'mi' ? `${Math.round(meters * 3.28084)} ft` : `${meters.toFixed(1)} m`;
}

// GPS fixes worse than this (metres of horizontal uncertainty) are what produce
// "phantom" speed while stationary indoors / near buildings — discard them
// before they ever reach the speed display.
const MIN_SPEED_ACCURACY_M = 20;
// how many recent readings the median smoothing looks at
const SPEED_SMOOTHING_WINDOW = 5;
// only suppress speed for "on foot" at plausible walking/running speeds — past
// this, it's clearly not foot traffic (e.g. walking on deck while under way),
// so show the real speed regardless of recent steps
const FOOT_SPEED_CEILING_MPS = 20 / 3.6; // ~20 km/h

function medianOf(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function formatElapsed(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function MapScreen() {
  const navigation = useNavigation<any>();
  const { isTracking, elapsedSeconds, distanceKm, startTrip, endTrip } = useTrip();
  const { formatSpeed, distanceUnit, depthMode, shallowAlertEnabled, shallowAlertDepthM } = useUnits();
  const [pins, setPins] = useState<CatchPin[]>([]);
  const [marinas, setMarinas] = useState<MarinaPin[]>([]);
  const [hasLocationPerm, setHasLocationPerm] = useState(false);
  const [speedMps, setSpeedMps] = useState<number | null>(null);
  const speedSubRef = useRef<Location.LocationSubscription | null>(null);
  // recent accuracy-gated readings, for the median smoothing
  const speedBufferRef = useRef<number[]>([]);
  // true while steps have been detected recently — used to hide speed while
  // walking/running (a boat produces no footfalls)
  const [onFoot, setOnFoot] = useState(false);
  const pedSubRef = useRef<{ remove: () => void } | null>(null);
  const onFootTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');
  const [depthM, setDepthM] = useState<number | null>(null);
  // shallow-water warning banner + refs so the GPS watcher (set up once) reads
  // the live alert settings without being torn down when they change.
  const [shallowWarning, setShallowWarning] = useState(false);
  const shallowEnabledRef = useRef(shallowAlertEnabled);
  const shallowDepthRef = useRef(shallowAlertDepthM);
  const wasShallowRef = useRef(false);
  // throttles depth re-queries (last point + time we asked the county service)
  const lastDepthRef = useRef<{ lat: number; lon: number; t: number } | null>(null);
  // the GPS watcher is set up once, so it reads the live mode through a ref
  const depthModeRef = useRef(depthMode);
  // last known map centre, so switching to 'map' mode can seed a reading
  const regionRef = useRef({ latitude: 44.62, longitude: -79.40 });
  const [userId, setUserId] = useState<string | null>(null);

  // offline maps: when on, the tile layers serve only from the on-device cache
  // (no network). Persisted so it survives app restarts. mapRef is used to read
  // the visible bounds when downloading "this area".
  const mapRef = useRef<MapView>(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [download, setDownload] = useState<DownloadProgress | null>(null);
  const cancelDownloadRef = useRef(false);
  // live conditions panel (opened by the top-left conditions icon)
  const [weather, setWeather] = useState<Weather | null>(null);
  const [showConditions, setShowConditions] = useState(false);

  // clustering: the live region drives how tightly catch pins group together
  const [region, setRegion] = useState<Region>({
    latitude: 44.62,
    longitude: -79.40,
    latitudeDelta: 0.15,
    longitudeDelta: 0.15,
  });
  const clusters = useMemo(() => clusterPoints(pins, region), [pins, region]);

  // search: local marina matches (instant, offline) + geocoded places (online)
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<Place[]>([]);
  const placeSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const marinaResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return marinas
      .filter((m) => m.latitude != null && m.longitude != null && m.name.toLowerCase().includes(q))
      .slice(0, 5);
  }, [query, marinas]);

  // trip composer state — opens once a trip ends, pre-filled with tracked stats
  const [showTripComposer, setShowTripComposer] = useState(false);
  const [tripPrefill, setTripPrefill] = useState<{ duration_hours: number; distance_km: number } | null>(null);

  // composer state
  const [showComposer, setShowComposer] = useState(false);
  const [newCoord, setNewCoord] = useState<{ latitude: number; longitude: number } | null>(null);
  const [species, setSpecies] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    requestLocation();
    loadPins();
    loadMarinas();
    // getSession() is local (no network) so we still know the user offline
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
    AsyncStorage.getItem('narrows.offlineMode').then((v) => setOfflineMode(v === '1'));
    // conditions for the map's area (getWeather caches, so this is cheap)
    getWeather(regionRef.current.latitude, regionRef.current.longitude).then(setWeather);
  }, []);

  function toggleOffline() {
    setOfflineMode((v) => {
      const next = !v;
      AsyncStorage.setItem('narrows.offlineMode', next ? '1' : '0').catch(() => {});
      return next;
    });
  }

  // Download every tile covering the currently-visible map area (base + depth)
  // for offline use. Confirms the tile count first, shows live progress, and can
  // be cancelled mid-download.
  async function handleDownloadArea() {
    if (!BASE_TILES_ENABLED) {
      Alert.alert('Offline maps unavailable', 'No offline map provider is configured yet.');
      return;
    }
    const bounds = await mapRef.current?.getMapBoundaries();
    if (!bounds) return;

    const count = estimateTileCount(bounds, OFFLINE_MIN_ZOOM, OFFLINE_MAX_ZOOM);
    if (count > OFFLINE_MAX_TILES) {
      Alert.alert(
        'Area too large',
        `This area needs ~${count.toLocaleString()} tiles (limit ${OFFLINE_MAX_TILES.toLocaleString()}). Zoom in and try a smaller area.`
      );
      return;
    }

    Alert.alert(
      'Download this area?',
      `Saves ~${count.toLocaleString()} map tiles for offline use.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Download',
          onPress: async () => {
            cancelDownloadRef.current = false;
            setDownload({ done: 0, total: count, failed: 0 });
            const result = await downloadRegion(bounds, {
              minZ: OFFLINE_MIN_ZOOM,
              maxZ: OFFLINE_MAX_ZOOM,
              onProgress: setDownload,
              shouldCancel: () => cancelDownloadRef.current,
            });
            setDownload(null);
            if (result.cancelled) return;
            await addRegion({
              name: 'Saved area',
              bounds,
              minZ: OFFLINE_MIN_ZOOM,
              maxZ: OFFLINE_MAX_ZOOM,
              tiles: result.done - result.failed,
            });
            Alert.alert(
              'Area saved',
              result.failed > 0
                ? `Saved with ${result.failed.toLocaleString()} tiles unavailable. The rest works offline.`
                : 'This area now works offline. Manage saved maps in Settings → Offline Maps.'
            );
          },
        },
      ]
    );
  }

  // keep the alert refs live for the long-lived GPS watcher; clearing the
  // banner when the feature (or 'map' depth mode, where depth isn't under the
  // boat) means an alert no longer applies.
  useEffect(() => {
    shallowEnabledRef.current = shallowAlertEnabled;
    shallowDepthRef.current = shallowAlertDepthM;
    if (!shallowAlertEnabled || depthMode !== 'location') {
      wasShallowRef.current = false;
      setShallowWarning(false);
    }
  }, [shallowAlertEnabled, shallowAlertDepthM, depthMode]);

  // switching depth mode clears the old reading; 'map' mode seeds one straight
  // away from the current centre, 'location' mode waits for the next GPS fix.
  useEffect(() => {
    depthModeRef.current = depthMode;
    lastDepthRef.current = null;
    setDepthM(null);
    if (depthMode === 'map') {
      queryDepthAt(regionRef.current.latitude, regionRef.current.longitude);
    }
  }, [depthMode]);

  // load marina locations (static pins, separate from community catch pins)
  async function loadMarinas() {
    try {
      const { data, error } = await withTimeout(
        supabase.from('marinas').select('id, name, latitude, longitude')
      );
      if (error) throw error;
      setMarinas(data || []);
      await cacheSet('mapMarinas', data || []);
    } catch {
      const cached = await cacheGet<MarinaPin[]>('mapMarinas');
      if (cached) setMarinas(cached);
    }
  }

  // ask for GPS permission so the blue user-location dot can show
  async function requestLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setHasLocationPerm(status === 'granted');
  }

  // live speed readout — only while the Map tab is focused (saves battery on
  // other tabs). GPS gives coords.speed in m/s; UnitsContext formats it.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted' || !active) return;
        speedSubRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 2000 },
          (loc) => {
            processSpeedReading(loc);
            if (depthModeRef.current === 'location') {
              updateDepthFromGps(loc.coords.latitude, loc.coords.longitude);
            }
          }
        );
      })();
      return () => {
        active = false;
        speedSubRef.current?.remove();
        speedSubRef.current = null;
        speedBufferRef.current = [];
        setSpeedMps(null);
      };
    }, [])
  );

  // pedometer — a boat produces no footfalls, so recent steps mean the phone
  // is being carried on foot (walking to the dock, running, etc). Used to hide
  // the speed readout so GPS speed while walking doesn't look like boat speed.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const available = await Pedometer.isAvailableAsync().catch(() => false);
        if (!available || !active) return;
        const perm = await Pedometer.requestPermissionsAsync().catch(() => null);
        if (perm?.status !== 'granted' || !active) return;

        pedSubRef.current = Pedometer.watchStepCount(() => {
          setOnFoot(true);
          // "on foot" stays true for a short window after the last step, so a
          // brief pause walking doesn't immediately flip speed back on
          if (onFootTimeoutRef.current) clearTimeout(onFootTimeoutRef.current);
          onFootTimeoutRef.current = setTimeout(() => setOnFoot(false), 10000);
        });
      })();
      return () => {
        active = false;
        pedSubRef.current?.remove();
        pedSubRef.current = null;
        if (onFootTimeoutRef.current) clearTimeout(onFootTimeoutRef.current);
        onFootTimeoutRef.current = null;
        setOnFoot(false);
      };
    }, [])
  );

  // accuracy gate + median smoothing — see MIN_SPEED_ACCURACY_M / medianOf above.
  function processSpeedReading(loc: Location.LocationObject) {
    const accuracy = loc.coords.accuracy;
    // a fix iOS itself isn't confident about gets skipped entirely, so it never
    // enters the smoothing window
    if (accuracy != null && accuracy > MIN_SPEED_ACCURACY_M) return;

    const raw = loc.coords.speed != null && loc.coords.speed > 0 ? loc.coords.speed : 0;
    const buf = speedBufferRef.current;
    buf.push(raw);
    if (buf.length > SPEED_SMOOTHING_WINDOW) buf.shift();

    setSpeedMps(medianOf(buf));
  }

  // 'map' mode: depth at the centre crosshair, re-queried when the map settles.
  // Tiny moves are skipped so we don't hammer the county service.
  async function queryDepthAt(lat: number, lon: number) {
    const last = lastDepthRef.current;
    if (last && haversineMeters(last.lat, last.lon, lat, lon) < 25) return;
    lastDepthRef.current = { lat, lon, t: Date.now() };
    const d = await fetchDepthMeters(lat, lon);
    setDepthM(d);
  }

  // 'location' mode: depth under the boat. GPS fires far more often than we want
  // to query, so throttle to once every 12s or ~30m of travel.
  async function updateDepthFromGps(lat: number, lon: number) {
    const now = Date.now();
    const last = lastDepthRef.current;
    if (last && now - last.t < 12000 && haversineMeters(last.lat, last.lon, lat, lon) < 30) return;
    lastDepthRef.current = { lat, lon, t: now };
    const d = await fetchDepthMeters(lat, lon);
    setDepthM(d);
    evaluateShallow(d);
  }

  // Shallow-water alert (location depth mode only). Buzzes once and raises the
  // banner when depth drops below the threshold; a small hysteresis margin means
  // it doesn't flicker on/off right at the boundary. Off-water (null depth) is
  // treated as "no reading", not "safe" — we simply don't alert.
  function evaluateShallow(d: number | null) {
    if (!shallowEnabledRef.current || d == null) {
      if (wasShallowRef.current) {
        wasShallowRef.current = false;
        setShallowWarning(false);
      }
      return;
    }
    const threshold = shallowDepthRef.current;
    if (!wasShallowRef.current && d < threshold) {
      wasShallowRef.current = true;
      setShallowWarning(true);
      Vibration.vibrate([0, 400, 150, 400]); // buzz once on entering shallow water
    } else if (wasShallowRef.current && d > threshold + 0.3) {
      wasShallowRef.current = false;
      setShallowWarning(false);
    }
  }

  // load everyone's catch pins (community layer)
  async function loadPins() {
    try {
      const { data: pinsData, error } = await withTimeout(
        supabase
          .from('catch_pins')
          .select('id, latitude, longitude, species, notes, user_id, created_at')
          .order('created_at', { ascending: false })
      );
      if (error) throw error;

      const { data: profilesData } = await withTimeout(
        supabase.from('profiles').select('id, first_name, last_name')
      );

      const merged = (pinsData || []).map((p) => ({
        ...p,
        author: profilesData?.find((pr) => pr.id === p.user_id),
      }));
      setPins(merged);
      await cacheSet('mapPins', merged);
    } catch {
      const cached = await cacheGet<CatchPin[]>('mapPins');
      if (cached) setPins(cached);
    }
  }

  async function handleStartTrip() {
    const ok = await startTrip();
    if (!ok) {
      Alert.alert('Location needed', 'Enable location permission to track your trip.');
    }
  }

  function handleEndTrip() {
    const result = endTrip();
    setTripPrefill(result);
    setShowTripComposer(true);
  }

  // long-press the map → open the composer for that spot
  function handleLongPress(e: LongPressEvent) {
    setNewCoord(e.nativeEvent.coordinate);
    setSpecies('');
    setNotes('');
    setShowComposer(true);
  }

  async function savePin() {
    if (!newCoord) return;
    setSaving(true);

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      setSaving(false);
      return;
    }

    const { error } = await supabase.from('catch_pins').insert({
      user_id: user.id,
      latitude: newCoord.latitude,
      longitude: newCoord.longitude,
      species: species.trim() || null,
      notes: notes.trim() || null,
    });

    setSaving(false);
    if (error) {
      Alert.alert('Could not save pin', friendlyError(error));
      return;
    }

    setShowComposer(false);
    loadPins(); // refresh markers
  }

  function confirmDeletePin(pin: CatchPin) {
    if (pin.user_id !== userId) return; // only your own pins
    Alert.alert('Delete pin', `Remove this ${pin.species || 'catch'} pin?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('catch_pins').delete().eq('id', pin.id);
          loadPins();
        },
      },
    ]);
  }

  // tapping a cluster zooms in so its pins spread apart
  function zoomToCluster(latitude: number, longitude: number) {
    mapRef.current?.animateToRegion(
      {
        latitude,
        longitude,
        latitudeDelta: Math.max(region.latitudeDelta / 2.5, 0.004),
        longitudeDelta: Math.max(region.longitudeDelta / 2.5, 0.004),
      },
      350
    );
  }

  // debounced place lookup as the user types (marina matches are instant/local)
  function onQueryChange(text: string) {
    setQuery(text);
    if (placeSearchTimer.current) clearTimeout(placeSearchTimer.current);
    if (text.trim().length < 2) {
      setPlaceResults([]);
      return;
    }
    placeSearchTimer.current = setTimeout(async () => {
      setPlaceResults(await searchPlaces(text));
    }, 350);
  }

  function goToLocation(latitude: number, longitude: number) {
    mapRef.current?.animateToRegion({ latitude, longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 400);
    closeSearch();
  }

  function closeSearch() {
    setShowSearch(false);
    setQuery('');
    setPlaceResults([]);
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        userInterfaceStyle="dark"
        mapType={mapType}
        showsUserLocation={hasLocationPerm}
        showsMyLocationButton
        initialRegion={{
          latitude: 44.62, // Lake Couchiching / Orillia
          longitude: -79.40,
          latitudeDelta: 0.15,
          longitudeDelta: 0.15,
        }}
        onLongPress={handleLongPress}
        onRegionChangeComplete={(r) => {
          regionRef.current = { latitude: r.latitude, longitude: r.longitude };
          setRegion(r);
          if (depthMode === 'map') queryDepthAt(r.latitude, r.longitude);
        }}
      >
        {/* MapTiler base raster — only while offline mode is on. Online, we leave
            the native Apple/Google base map alone (no MapTiler quota used, no
            change to the online look). shouldReplaceMapContent swaps in the cached
            raster for the native base (which can't be served offline); offlineMode
            makes it serve cache-only. Populate the cache with "download this area"
            while online. */}
        {BASE_TILES_ENABLED && offlineMode && (
          <UrlTile
            urlTemplate={BASE_TILE_URL}
            tileCachePath={BASE_TILE_CACHE}
            offlineMode
            shouldReplaceMapContent
            maximumZ={OFFLINE_MAX_ZOOM}
            zIndex={-2}
          />
        )}

        {marinas
          .filter((m) => m.latitude != null && m.longitude != null)
          .map((m) => (
            <Marker
              key={`marina-${m.id}`}
              coordinate={{ latitude: m.latitude as number, longitude: m.longitude as number }}
              onCalloutPress={() => navigation.navigate('MarinaProfile', { marinaId: m.id })}
            >
              <View style={styles.marinaMarker}>
                <Ionicons name="boat" size={16} color={Colors.black} />
              </View>
              <Callout>
                <View style={styles.callout}>
                  <Text style={styles.calloutTitle}>{m.name}</Text>
                  <Text style={styles.calloutDelete}>Tap to view marina</Text>
                </View>
              </Callout>
            </Marker>
          ))}

        {clusters.map((c) => {
          // more than one pin in this cell → a numbered cluster bubble that
          // zooms in on tap; a single pin → the normal catch-pin marker.
          if (c.count > 1) {
            return (
              <Marker
                key={c.id}
                coordinate={{ latitude: c.latitude, longitude: c.longitude }}
                onPress={() => zoomToCluster(c.latitude, c.longitude)}
              >
                <View style={styles.clusterBubble}>
                  <Text style={styles.clusterText}>{c.count}</Text>
                </View>
              </Marker>
            );
          }
          const pin = c.items[0];
          return (
            <Marker
              key={pin.id}
              coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
              pinColor={Colors.gold}
              onCalloutPress={() => confirmDeletePin(pin)}
            >
              <Callout>
                <View style={styles.callout}>
                  <Text style={styles.calloutTitle}>{pin.species || 'Catch'}</Text>
                  <Text style={styles.calloutMeta}>
                    by {pin.author?.first_name || 'Boater'} {pin.author?.last_name || ''} · {timeAgo(pin.created_at)}
                  </Text>
                  {pin.notes ? <Text style={styles.calloutNotes}>{pin.notes}</Text> : null}
                  {pin.user_id === userId ? <Text style={styles.calloutDelete}>Tap to delete</Text> : null}
                </View>
              </Callout>
            </Marker>
          );
        })}
      </MapView>

      {/* search bar — tap to search marinas (local) and places (geocoded) */}
      <TouchableOpacity style={styles.searchBar} activeOpacity={0.9} onPress={() => setShowSearch(true)}>
        <Ionicons name="search" size={16} color={Colors.muted} />
        <Text style={styles.searchBarText}>Search marinas & places</Text>
      </TouchableOpacity>

      {/* offline mode toggle — serve tiles from the on-device cache only */}
      {BASE_TILES_ENABLED && (
        <TouchableOpacity style={styles.offlineToggleBtn} onPress={toggleOffline}>
          <Ionicons
            name={offlineMode ? 'cloud-offline' : 'cloud-offline-outline'}
            size={20}
            color={offlineMode ? Colors.gold : Colors.cream}
          />
        </TouchableOpacity>
      )}

      {/* download the visible area for offline use */}
      {BASE_TILES_ENABLED && (
        <TouchableOpacity
          style={styles.downloadAreaBtn}
          onPress={handleDownloadArea}
          disabled={download != null}
        >
          <Ionicons name="download-outline" size={20} color={Colors.cream} />
        </TouchableOpacity>
      )}

      {/* live conditions — opens the panel (button, no edge-gesture conflict) */}
      <TouchableOpacity
        style={styles.conditionsBtn}
        onPress={() => setShowConditions((v) => !v)}
      >
        <Ionicons
          name={showConditions ? 'partly-sunny' : 'partly-sunny-outline'}
          size={20}
          color={showConditions ? Colors.gold : Colors.cream}
        />
      </TouchableOpacity>

      {/* offline-mode banner + base-map attribution while the raster base is up */}
      {BASE_TILES_ENABLED && offlineMode && (
        <View style={styles.offlineBadge} pointerEvents="none">
          <Ionicons name="cloud-offline" size={13} color={Colors.gold} />
          <Text style={styles.offlineBadgeText}>Offline · {BASE_TILE_ATTRIBUTION}</Text>
        </View>
      )}

      {/* download progress overlay */}
      {download != null && (
        <View style={styles.downloadOverlay}>
          <View style={styles.downloadCard}>
            <ActivityIndicator color={Colors.gold} />
            <Text style={styles.downloadTitle}>Saving map area…</Text>
            <Text style={styles.downloadMeta}>
              {download.done.toLocaleString()} / {download.total.toLocaleString()} tiles
            </Text>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${download.total ? Math.round((download.done / download.total) * 100) : 0}%` },
                ]}
              />
            </View>
            <TouchableOpacity
              style={styles.downloadCancel}
              onPress={() => {
                cancelDownloadRef.current = true;
              }}
            >
              <Text style={styles.downloadCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* shallow-water warning — prominent bar, safety-relevant */}
      {shallowWarning && depthM != null && (
        <View style={styles.shallowBanner} pointerEvents="none">
          <Ionicons name="warning" size={18} color={Colors.white} />
          <Text style={styles.shallowText}>Shallow water · {formatDepth(depthM, distanceUnit)}</Text>
        </View>
      )}

      {/* center crosshair — only in 'map' mode, where it marks the measured point */}
      {depthMode === 'map' && (
        <View style={styles.centerReticle} pointerEvents="none">
          <View style={styles.reticleRing} />
          <View style={styles.reticleDot} />
        </View>
      )}

      {/* hint pill */}
      {!isTracking && (
        <View style={styles.hint} pointerEvents="none">
          <Text style={styles.hintText}>Long-press to drop a catch pin</Text>
        </View>
      )}

      {/* live trip stats while tracking */}
      {isTracking && (
        <View style={styles.tripStats} pointerEvents="none">
          <Text style={styles.tripStatsText}>{formatElapsed(elapsedSeconds)} · {distanceKm.toFixed(2)} km</Text>
        </View>
      )}

      {/* start / end trip button */}
      <TouchableOpacity
        style={[styles.tripBtn, isTracking && styles.tripBtnActive]}
        onPress={isTracking ? handleEndTrip : handleStartTrip}
      >
        <Ionicons name={isTracking ? 'stop-circle' : 'play-circle'} size={20} color={isTracking ? Colors.white : Colors.black} />
        <Text style={[styles.tripBtnText, isTracking && { color: Colors.white }]}>
          {isTracking ? 'End Trip' : 'Start Trip'}
        </Text>
      </TouchableOpacity>
      {/* satellite / standard toggle */}
      <TouchableOpacity
        style={styles.mapTypeBtn}
        onPress={() => setMapType((t) => (t === 'standard' ? 'satellite' : 'standard'))}
      >
        <Ionicons name={mapType === 'standard' ? 'earth' : 'map'} size={20} color={Colors.cream} />
      </TouchableOpacity>

      {/* live water-depth readout — under the speed box, only when over mapped water */}
      {depthM != null && (
        <View style={styles.depthBox} pointerEvents="none">
          <Text style={styles.depthValue}>{formatDepth(depthM, distanceUnit)}</Text>
          <Text style={styles.depthCaption}>DEPTH</Text>
        </View>
      )}

      {/* attribution + safety disclaimer — shown whenever a depth reading is displayed */}
      {depthM != null && (
        <View style={styles.depthCredit} pointerEvents="none">
          <Text style={styles.depthCreditText}>
            Depth © Simcoe County (OGL) · reference only, not for navigation
          </Text>
        </View>
      )}

      {/* live speed readout — top-right under the map-type toggle. Hidden while
          recent steps suggest the phone is being carried on foot rather than
          on the boat, unless the speed itself is well past walking/running range. */}
      {hasLocationPerm && !(onFoot && (speedMps ?? 0) < FOOT_SPEED_CEILING_MPS) && (
        <View style={styles.speedBox} pointerEvents="none">
          <Text style={styles.speedValue}>{formatSpeed(speedMps)}</Text>
          <Text style={styles.speedCaption}>SPEED</Text>
        </View>
      )}

      {/* search overlay — input + marina/place results */}
      {showSearch && (
        <View style={styles.searchOverlay}>
          <View style={styles.searchInputRow}>
            <Ionicons name="search" size={18} color={Colors.muted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Marina or place…"
              placeholderTextColor={Colors.muted}
              value={query}
              onChangeText={onQueryChange}
              autoFocus
              returnKeyType="search"
            />
            <TouchableOpacity onPress={closeSearch}>
              <Text style={styles.searchCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.searchResults}>
            {marinaResults.map((m) => (
              <TouchableOpacity
                key={`m-${m.id}`}
                style={styles.resultRow}
                onPress={() => goToLocation(m.latitude as number, m.longitude as number)}
              >
                <Ionicons name="boat" size={16} color={Colors.gold} />
                <Text style={styles.resultText} numberOfLines={1}>{m.name}</Text>
                <Text style={styles.resultTag}>Marina</Text>
              </TouchableOpacity>
            ))}
            {placeResults.map((p) => (
              <TouchableOpacity key={p.id} style={styles.resultRow} onPress={() => goToLocation(p.latitude, p.longitude)}>
                <Ionicons name="location-outline" size={16} color={Colors.muted} />
                <Text style={styles.resultText} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.resultTag}>{p.detail}</Text>
              </TouchableOpacity>
            ))}
            {query.trim().length >= 2 && marinaResults.length === 0 && placeResults.length === 0 && (
              <Text style={styles.noResults}>No matches</Text>
            )}
          </ScrollView>
        </View>
      )}

      {/* live conditions — icon-opened panel above the tab bar, drag down to close */}
      <ConditionsSheet
        visible={showConditions}
        onClose={() => setShowConditions(false)}
        weather={weather}
      />

      {/* new-pin composer */}
      <Modal
        visible={showComposer}
        animationType="slide"
        transparent
        onRequestClose={() => setShowComposer(false)}
      >
        <View style={styles.backdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.sheet}
          >
            <DismissKeyboardView style={{ flex: 0 }}>
            <Text style={styles.sheetTitle}>New catch pin</Text>
            <TextInput
              style={styles.input}
              placeholder="Species (e.g. Walleye)"
              placeholderTextColor={Colors.muted}
              value={species}
              onChangeText={setSpecies}
              maxLength={40}
            />
            <TextInput
              style={[styles.input, styles.notes]}
              placeholder="Notes (depth, lure, time of day…)"
              placeholderTextColor={Colors.muted}
              value={notes}
              onChangeText={setNotes}
              multiline
              maxLength={280}
            />
            <View style={styles.row}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowComposer(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={savePin} disabled={saving}>
                <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save pin'}</Text>
              </TouchableOpacity>
            </View>
            </DismissKeyboardView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* finished-trip composer — pre-filled with tracked duration/distance */}
      <PostComposer
        visible={showTripComposer}
        onClose={() => setShowTripComposer(false)}
        onSaved={() => setShowTripComposer(false)}
        tripPrefill={tripPrefill ?? undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  map: { flex: 1 },

  marinaMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.cream,
  },
  clusterBubble: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: 8,
    borderRadius: 17,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  clusterText: { color: Colors.black, fontSize: 14, fontWeight: '800' },
  searchBar: {
    position: 'absolute',
    top: 60,
    left: 64,
    right: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  searchBarText: { color: Colors.muted, fontSize: 14, fontWeight: '600' },
  searchOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.9)',
    paddingTop: 56,
    paddingHorizontal: 16,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, color: Colors.cream, fontSize: 16 },
  searchCancel: { color: Colors.gold, fontSize: 15, fontWeight: '600' },
  searchResults: { marginTop: 8 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  resultText: { flex: 1, color: Colors.cream, fontSize: 15, fontWeight: '600' },
  resultTag: { color: Colors.muted, fontSize: 12 },
  noResults: { color: Colors.muted, fontSize: 14, textAlign: 'center', paddingVertical: 24 },

  hint: {
    position: 'absolute',
    top: 112,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  hintText: { color: Colors.cream, fontSize: 13, fontWeight: '600' },

  tripStats: {
    position: 'absolute',
    top: 112,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  tripStatsText: { color: Colors.gold, fontSize: 13, fontWeight: '700' },

  tripBtn: {
    position: 'absolute',
    bottom: 110,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.gold,
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  tripBtnActive: {
    backgroundColor: '#7F1D1D',
  },
  tripBtnText: { color: Colors.black, fontSize: 15, fontWeight: '700' },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  sheetTitle: { color: Colors.cream, fontSize: 18, fontWeight: '700', marginBottom: 16 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.cream,
    fontSize: 15,
    marginBottom: 12,
  },
  notes: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.surface,
  },
  cancelText: { color: Colors.muted, fontWeight: '600', fontSize: 15 },
  saveBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.gold,
  },
    mapTypeBtn: {
    position: 'absolute',
    top: 60,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    padding: 10,
  },
  offlineToggleBtn: {
    position: 'absolute',
    top: 60,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    padding: 10,
  },
  downloadAreaBtn: {
    position: 'absolute',
    top: 112,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    padding: 10,
  },
  conditionsBtn: {
    position: 'absolute',
    top: 164,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    padding: 10,
  },
  offlineBadge: {
    position: 'absolute',
    bottom: 190,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    maxWidth: '88%',
  },
  offlineBadgeText: { color: Colors.cream, fontSize: 11, fontWeight: '600' },
  downloadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 22,
    width: '78%',
    alignItems: 'center',
    gap: 10,
  },
  downloadTitle: { color: Colors.cream, fontSize: 16, fontWeight: '700' },
  downloadMeta: { color: Colors.muted, fontSize: 13 },
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.surfaceAlt,
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: Colors.gold },
  downloadCancel: { paddingVertical: 8, paddingHorizontal: 20, marginTop: 2 },
  downloadCancelText: { color: Colors.muted, fontSize: 14, fontWeight: '600' },
  shallowBanner: {
    position: 'absolute',
    top: 110,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#B91C1C',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  shallowText: { color: Colors.white, fontSize: 14, fontWeight: '800' },
  depthBox: {
    position: 'absolute',
    top: 176,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    minWidth: 84,
  },
  depthValue: { color: '#4FB0E0', fontSize: 18, fontWeight: '800' },
  depthCaption: { color: Colors.cream, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  centerReticle: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 24,
    height: 24,
    marginLeft: -12,
    marginTop: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleRing: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  reticleDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4FB0E0' },
  depthCredit: {
    position: 'absolute',
    bottom: 160,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    maxWidth: '88%',
  },
  depthCreditText: { color: Colors.cream, fontSize: 10, textAlign: 'center', lineHeight: 14 },
  speedBox: {
    position: 'absolute',
    top: 112,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    minWidth: 84,
  },
  speedValue: { color: Colors.gold, fontSize: 18, fontWeight: '800' },
  speedCaption: { color: Colors.cream, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  saveText: { color: Colors.black, fontWeight: '700', fontSize: 15 },
  callout: { width: 200, paddingVertical: 4, paddingHorizontal: 2 },
  calloutTitle: { fontWeight: '700', fontSize: 14, color: '#111', marginBottom: 2 },
  calloutMeta: { fontSize: 12, color: '#666', marginBottom: 4 },
  calloutNotes: { fontSize: 13, color: '#222' },
  calloutDelete: { fontSize: 12, color: '#C0392B', marginTop: 6, fontWeight: '600' },
});
