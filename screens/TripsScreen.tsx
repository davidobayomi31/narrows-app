import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { useUnits } from '../contexts/UnitsContext';
import { getTrips, deleteTrip, TripRecord } from '../lib/tripHistory';

// "Fri, Jul 25 · 2:14 PM"
function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function TripsScreen() {
  const navigation = useNavigation<any>();
  const { formatDistance, formatDuration } = useUnits();
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    getTrips().then((t) => {
      setTrips(t);
      setLoaded(true);
    });
  }, []);

  // reload whenever the screen regains focus (e.g. after ending a new trip)
  useFocusEffect(load);

  function confirmDelete(trip: TripRecord) {
    Alert.alert('Delete trip', 'Remove this trip from your history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteTrip(trip.id);
          load();
        },
      },
    ]);
  }

  function renderItem({ item }: { item: TripRecord }) {
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => navigation.navigate('TripDetail', { tripId: item.id })}
        onLongPress={() => confirmDelete(item)}
      >
        <View style={styles.rowIcon}>
          <Ionicons name="navigate" size={18} color={Colors.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{formatWhen(item.started_at)}</Text>
          <Text style={styles.rowMeta}>
            {formatDistance(item.distance_km)} · {formatDuration(item.duration_hours)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.muted} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={trips}
        keyExtractor={(t) => t.id}
        renderItem={renderItem}
        contentContainerStyle={styles.content}
        ListEmptyComponent={
          loaded ? (
            <View style={styles.empty}>
              <Ionicons name="boat-outline" size={40} color={Colors.muted} />
              <Text style={styles.emptyTitle}>No trips yet</Text>
              <Text style={styles.emptyBody}>
                Tap “Start Trip” on the map and your route will be saved here when you end it.
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, paddingBottom: 60, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { color: Colors.cream, fontSize: 15, fontWeight: '700' },
  rowMeta: { color: Colors.muted, fontSize: 13, marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100, gap: 10 },
  emptyTitle: { color: Colors.cream, fontSize: 17, fontWeight: '700' },
  emptyBody: { color: Colors.muted, fontSize: 14, textAlign: 'center', paddingHorizontal: 30, lineHeight: 20 },
});
