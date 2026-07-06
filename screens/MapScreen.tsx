import { useEffect, useRef, useState, useCallback } from 'react';
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
} from 'react-native';
import MapView, { Marker, LongPressEvent, Callout } from 'react-native-maps';
import * as Location from 'expo-location';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';
import { Ionicons } from '@expo/vector-icons';
import { useTrip } from '../contexts/TripContext';
import { useUnits } from '../contexts/UnitsContext';
import PostComposer from './components/PostComposer';

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
  const { formatSpeed } = useUnits();
  const [pins, setPins] = useState<CatchPin[]>([]);
  const [marinas, setMarinas] = useState<MarinaPin[]>([]);
  const [hasLocationPerm, setHasLocationPerm] = useState(false);
  const [speedMps, setSpeedMps] = useState<number | null>(null);
  const speedSubRef = useRef<Location.LocationSubscription | null>(null);
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');
  const [userId, setUserId] = useState<string | null>(null);

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
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // load marina locations (static pins, separate from community catch pins)
  async function loadMarinas() {
    const { data } = await supabase.from('marinas').select('id, name, latitude, longitude');
    setMarinas(data || []);
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
          (loc) => setSpeedMps(loc.coords.speed)
        );
      })();
      return () => {
        active = false;
        speedSubRef.current?.remove();
        speedSubRef.current = null;
        setSpeedMps(null);
      };
    }, [])
  );

  // load everyone's catch pins (community layer)
  async function loadPins() {
    const { data: pinsData } = await supabase
      .from('catch_pins')
      .select('id, latitude, longitude, species, notes, user_id, created_at')
      .order('created_at', { ascending: false });

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, first_name, last_name');

    const merged = (pinsData || []).map((p) => ({
      ...p,
      author: profilesData?.find((pr) => pr.id === p.user_id),
    }));
    setPins(merged);
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

    const { data: { user } } = await supabase.auth.getUser();
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

  return (
    <View style={styles.container}>
      <MapView
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
      >
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

        {pins.map((pin) => (
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
        ))}
      </MapView>

      {/* hint pill */}
      {!isTracking && (
        <View style={styles.hint} pointerEvents="none">
          <Text style={styles.hintText}>Long-press the map to drop a catch pin</Text>
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

      {/* live speed readout — top-right under the map-type toggle */}
      {hasLocationPerm && (
        <View style={styles.speedBox} pointerEvents="none">
          <Text style={styles.speedValue}>{formatSpeed(speedMps)}</Text>
          <Text style={styles.speedCaption}>SPEED</Text>
        </View>
      )}

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
            <Text style={styles.sheetTitle}>New catch pin</Text>
            <TextInput
              style={styles.input}
              placeholder="Species (e.g. Walleye)"
              placeholderTextColor={Colors.muted}
              value={species}
              onChangeText={setSpecies}
            />
            <TextInput
              style={[styles.input, styles.notes]}
              placeholder="Notes (depth, lure, time of day…)"
              placeholderTextColor={Colors.muted}
              value={notes}
              onChangeText={setNotes}
              multiline
            />
            <View style={styles.row}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowComposer(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={savePin} disabled={saving}>
                <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save pin'}</Text>
              </TouchableOpacity>
            </View>
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

  hint: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  hintText: { color: Colors.cream, fontSize: 13, fontWeight: '600' },

  tripStats: {
    position: 'absolute',
    top: 60,
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
