import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';

const PINS = [
  { id: '1', name: 'Blue Beacon Marina', type: 'Marina', distance: '0.3 km' },
  { id: '2', name: 'Atherley Narrows', type: 'Waterway', distance: '1.1 km' },
  { id: '3', name: 'Couchiching Beach Launch', type: 'Launch Ramp', distance: '2.4 km' },
  { id: '4', name: 'Midland Town Dock', type: 'Dock', distance: '18 km' },
];

export default function MapScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Map placeholder */}
      <View style={styles.mapPlaceholder}>
        <Text style={styles.mapIcon}>🗺️</Text>
        <Text style={styles.mapPlaceholderText}>Interactive Map</Text>
        <Text style={styles.mapPlaceholderSub}>Coming soon — Simcoe County waterways</Text>
      </View>

      {/* Nearby list */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>Nearby</Text>
        {PINS.map((pin) => (
          <View key={pin.id} style={styles.pinCard}>
            <View style={styles.pinInfo}>
              <Text style={styles.pinName}>{pin.name}</Text>
              <Text style={styles.pinType}>{pin.type}</Text>
            </View>
            <Text style={styles.pinDistance}>{pin.distance}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  mapPlaceholder: {
    height: 220,
    backgroundColor: '#0A1628',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#2E4057',
  },
  mapIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  mapPlaceholderText: {
    color: Colors.cream,
    fontSize: 18,
    fontWeight: 'bold',
  },
  mapPlaceholderSub: {
    color: '#8899AA',
    fontSize: 13,
    marginTop: 4,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 48,
  },
  sectionTitle: {
    color: Colors.cream,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  pinCard: {
    backgroundColor: '#0F0F0F',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1E1E1E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pinInfo: {
    flex: 1,
  },
  pinName: {
    color: Colors.cream,
    fontSize: 15,
    fontWeight: '600',
  },
  pinType: {
    color: '#8899AA',
    fontSize: 12,
    marginTop: 2,
  },
  pinDistance: {
    color: Colors.gold,
    fontSize: 13,
    fontWeight: '600',
  },
});

