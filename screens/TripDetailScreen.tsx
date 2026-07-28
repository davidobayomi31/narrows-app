import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share, Alert, ActivityIndicator } from 'react-native';
import MapView, { Polyline, Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { useUnits } from '../contexts/UnitsContext';
import { getTrip, TripRecord } from '../lib/tripHistory';
import PostComposer from './components/PostComposer';

const EDGE_PADDING = { top: 70, right: 50, bottom: 70, left: 50 };

export default function TripDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { tripId } = route.params;
  const { formatDistance, formatDuration } = useUnits();

  const mapRef = useRef<MapView>(null);
  const [trip, setTrip] = useState<TripRecord | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showComposer, setShowComposer] = useState(false);

  useEffect(() => {
    getTrip(tripId).then((t) => {
      if (t) setTrip(t);
      else setNotFound(true);
    });
  }, [tripId]);

  // frame the whole route once the map is ready and we have the path
  function fitToRoute() {
    if (trip && trip.path.length > 1) {
      mapRef.current?.fitToCoordinates(trip.path, { edgePadding: EDGE_PADDING, animated: false });
    }
  }

  async function shareTrip() {
    if (!trip || sharing) return;
    setSharing(true);
    try {
      // react-native-maps snapshots the map (base + route line) natively — more
      // reliable than a generic view capture for map content.
      const uri = await mapRef.current?.takeSnapshot({
        format: 'png',
        quality: 0.9,
        result: 'file',
      } as any);
      // Share (iOS) needs a file:// URL; takeSnapshot may hand back a bare path.
      const shareUri = uri && !uri.startsWith('file') ? `file://${uri}` : uri;
      const message = `My trip on Narrows — ${formatDistance(trip.distance_km)} in ${formatDuration(
        trip.duration_hours
      )}`;
      await Share.share(shareUri ? { url: shareUri, message } : { message });
    } catch {
      Alert.alert('Could not share', 'Something went wrong preparing the trip image.');
    } finally {
      setSharing(false);
    }
  }

  if (notFound) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.missing}>This trip is no longer available.</Text>
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={Colors.gold} />
      </View>
    );
  }

  const start = trip.path[0];
  const end = trip.path[trip.path.length - 1];

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={styles.map}
        userInterfaceStyle="dark"
        initialRegion={{
          latitude: start.latitude,
          longitude: start.longitude,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        }}
        onMapReady={fitToRoute}
      >
        <Polyline coordinates={trip.path} strokeColor={Colors.gold} strokeWidth={4} />
        <Marker coordinate={start} pinColor="#2E9E5B" title="Start" />
        <Marker coordinate={end} pinColor="#B91C1C" title="End" />
      </MapView>

      {/* back button (screen has no nav header) */}
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Ionicons name="chevron-back" size={24} color={Colors.cream} />
      </TouchableOpacity>

      {/* stats + actions card */}
      <View style={styles.card}>
        <View style={styles.statsRow}>
          <Stat label="Distance" value={formatDistance(trip.distance_km)} />
          <View style={styles.divider} />
          <Stat label="Time" value={formatDuration(trip.duration_hours)} />
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowComposer(true)}>
            <Ionicons name="add-circle-outline" size={18} color={Colors.black} />
            <Text style={styles.actionText}>Post to feed</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.actionSecondary]} onPress={shareTrip} disabled={sharing}>
            <Ionicons name="share-outline" size={18} color={Colors.cream} />
            <Text style={[styles.actionText, styles.actionTextSecondary]}>{sharing ? 'Preparing…' : 'Share'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <PostComposer
        visible={showComposer}
        onClose={() => setShowComposer(false)}
        onSaved={() => setShowComposer(false)}
        tripPrefill={{ duration_hours: trip.duration_hours, distance_km: trip.distance_km }}
      />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  missing: { color: Colors.muted, fontSize: 15 },
  map: { flex: 1 },
  backBtn: {
    position: 'absolute',
    top: 60,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    padding: 8,
  },
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 30,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
  },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: Colors.cream, fontSize: 20, fontWeight: '800' },
  statLabel: { color: Colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  divider: { width: 1, height: 34, backgroundColor: Colors.surfaceAlt },
  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.gold,
    borderRadius: 12,
    paddingVertical: 12,
  },
  actionSecondary: { backgroundColor: Colors.surfaceAlt },
  actionText: { color: Colors.black, fontSize: 14, fontWeight: '700' },
  actionTextSecondary: { color: Colors.cream },
});
