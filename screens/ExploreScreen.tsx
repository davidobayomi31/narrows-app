import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { useState } from 'react';

const CATEGORIES = ['Marinas', 'Launch Ramps', 'Fishing Spots', 'Events', 'Hazards'];

const MARINAS = [
  {
    id: '1',
    name: 'Blue Beacon Marina',
    location: 'Orillia, ON',
    amenities: ['Gas', 'Pump-Out', 'Hydro', 'Mechanic'],
  },
  {
    id: '2',
    name: 'Lagoon City Marina',
    location: 'Brechin, ON',
    amenities: ['Gas', 'Hydro', 'Pumpout'],
  },
  {
    id: '3',
    name: 'Midland Town Dock',
    location: 'Midland, ON',
    amenities: ['Hydro', 'Water', 'Pump-Out'],
  },
  {
    id: '4',
    name: 'Penetanguishene Town Wharf',
    location: 'Penetanguishene, ON',
    amenities: ['Transient Docking', 'Hydro'],
  },
];

export default function ExploreScreen() {
  const [activeCategory, setActiveCategory] = useState('Marinas');

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Category tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryContent}
      >
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.categoryTab, activeCategory === cat && styles.categoryTabActive]}
            onPress={() => setActiveCategory(cat)}
          >
            <Text style={[styles.categoryText, activeCategory === cat && styles.categoryTextActive]}>
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Marina list */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {MARINAS.map((marina) => (
          <View key={marina.id} style={styles.card}>
            <Text style={styles.marinaName}>{marina.name}</Text>
            <Text style={styles.marinaLocation}>📍 {marina.location}</Text>
            <View style={styles.tagRow}>
              {marina.amenities.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
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
  categoryScroll: {
    flexGrow: 0,
  },
  categoryContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  categoryTab: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2E4057',
    marginRight: 8,
  },
  categoryTabActive: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  categoryText: {
    color: '#8899AA',
    fontSize: 13,
  },
  categoryTextActive: {
    color: Colors.black,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 48,
  },
  card: {
    backgroundColor: '#0F0F0F',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E1E1E',
  },
  marinaName: {
    color: Colors.cream,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  marinaLocation: {
    color: '#8899AA',
    fontSize: 13,
    marginBottom: 12,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
});