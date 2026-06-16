import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Homepage() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>NARROWS</Text>
          <TouchableOpacity style={styles.marinaDropdown}>
            <Text style={styles.marinaDropdownText}>Lake Couchiching ▼</Text>
          </TouchableOpacity>
        </View>

        {/* Alert Banner */}
        <View style={styles.alertBanner}>
          <Text style={styles.alertText}>⚠ Low water levels near Narrows Channel</Text>
        </View>

        {/* Featured Marina Card */}
        <View style={styles.card}>
          <Text style={styles.featuredLabel}> Featured</Text>
          <Text style={styles.marinaName}>Blue Beacon Marina</Text>
          <Text style={styles.marinaDetail}> Lake Couchiching</Text>
          <Text style={styles.marinaDetail}> 693 Atherley Rd, Orillia</Text>
          <Text style={styles.marinaDetail}>  705-325-2526</Text>

          <View style={styles.tagRow}>
            {['Gas', 'Pump-Out', 'Hydro', 'Mechanic'].map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.directionsButton}>
            <Text style={styles.directionsButtonText}>🧭  Get Directions</Text>
          </TouchableOpacity>
        </View>

        {/* Live Conditions */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Live Conditions</Text>
          <View style={styles.conditionsGrid}>
            <View style={styles.conditionCell}>
              <Text style={styles.conditionValue}>12 km/h</Text>
              <Text style={styles.conditionLabel}>Wind</Text>
            </View>
            <View style={styles.conditionCell}>
              <Text style={styles.conditionValue}>18°C</Text>
              <Text style={styles.conditionLabel}>Water Temp</Text>
            </View>
            <View style={styles.conditionCell}>
              <Text style={styles.conditionValue}>Rising</Text>
              <Text style={styles.conditionLabel}>Tide</Text>
            </View>
            <View style={styles.conditionCell}>
              <Text style={styles.conditionValue}>6:02 AM</Text>
              <Text style={styles.conditionLabel}>Sunrise</Text>
            </View>
          </View>
        </View>

        {/* This Week at the Dock */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>This Week at the Dock</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.weekScroll}>
            {DAYS.map((day) => (
              <View key={day} style={styles.dayCard}>
                <Text style={styles.dayLabel}>{day}</Text>
                <Text style={styles.dayCondition}>⛵</Text>
                <Text style={styles.dayTemp}>21°C</Text>
              </View>
            ))}
          </ScrollView>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 48,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  headerTitle: {
    color: Colors.cream,
    fontSize: 22,
    fontWeight: 'bold',
    letterSpacing: 6,
  },
  marinaDropdown: {
    borderWidth: 1,
    borderColor: Colors.gold,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  marinaDropdownText: {
    color: Colors.gold,
    fontSize: 13,
  },

  // Alert
  alertBanner: {
    backgroundColor: '#2A1F00',
    borderLeftWidth: 3,
    borderLeftColor: '#F0B429',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  alertText: {
    color: '#F0B429',
    fontSize: 13,
  },

  // Cards
  card: {
    backgroundColor: '#0F0F0F',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E1E1E',
  },
  featuredLabel: {
    color: Colors.gold,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  marinaName: {
    color: Colors.cream,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  marinaDetail: {
    color: '#8899AA',
    fontSize: 14,
    marginBottom: 4,
  },

  // Amenity tags
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    marginBottom: 16,
  },
  tag: {
    borderWidth: 1,
    borderColor: '#2E4057',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    color: '#8899AA',
    fontSize: 12,
  },

  // Directions button
  directionsButton: {
    backgroundColor: Colors.gold,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  directionsButtonText: {
    color: Colors.black,
    fontWeight: '700',
    fontSize: 15,
  },

  // Section title
  sectionTitle: {
    color: Colors.cream,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
  },

  // Conditions grid
  conditionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  conditionCell: {
    width: '50%',
    paddingVertical: 12,
  },
  conditionValue: {
    color: Colors.cream,
    fontSize: 22,
    fontWeight: 'bold',
  },
  conditionLabel: {
    color: '#8899AA',
    fontSize: 13,
    marginTop: 2,
  },

  // Weekly scroll
  weekScroll: {
    marginTop: 4,
  },
  dayCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginRight: 10,
    width: 64,
  },
  dayLabel: {
    color: '#8899AA',
    fontSize: 12,
    marginBottom: 6,
  },
  dayCondition: {
    fontSize: 20,
    marginBottom: 6,
  },
  dayTemp: {
    color: Colors.cream,
    fontSize: 13,
    fontWeight: '600',
  },
});
