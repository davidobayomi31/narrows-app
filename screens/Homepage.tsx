import { View, Text, StyleSheet, ScrollView, TouchableOpacity, } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { useEffect, useState} from 'react';
import { supabase} from '../lib/supabase';
import { useNavigation } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons} from '@expo/vector-icons';
import { getWeather, Weather} from '../lib/weather';
import WindCompass from './components/WindCompass';

// 322 -> 'NW'
function degToCompass(deg: number) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

// UV number -> risk label
function uvLabel(uv: number) {
  if (uv <= 2) return 'Low';
  if (uv <= 5) return 'Moderate';
  if (uv <= 7) return 'High';
  if (uv <= 10) return 'Very High';
  return 'Extreme';
}
export default function Homepage(){
  // shape of a marina row from the DB
  type Marina = {
    id: string;
    name: string;
    lake: string | null;
    address: string | null;
    phone: string | null;
    amenities: string[] | null;
    latitude: number | null;
    longitude: number | null;
  };

  // holds the featured marina once it loads (null until then)
  const [marina, setMarina] = useState<Marina | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const navigation = useNavigation<any>();

    // load the featured marina once when the screen first appears
  useEffect(() => {
    async function loadMarina() {
      const { data, error } = await supabase
        .from('marinas')
        .select('id, name, lake, address, phone, amenities, latitude, longitude')
        .eq('featured', true)
        .single();          // expect exactly one featured marina

      if (!error && data) {
        setMarina(data);
        if (data.latitude != null && data.latitude != null){
          const w = await getWeather(data.latitude, data.longitude);
          setWeather(w);
        }
      }
    }
    loadMarina();
  }, []);   // empty array = run once on mount

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>NARROWS</Text>
          <TouchableOpacity 
            style={styles.marinaDropdown}
            onPress={() => navigation.navigate('Explore')}
          >
            <Ionicons name="search" size={20} color={Colors.gold} />
          </TouchableOpacity>

        </View>

        {/* Alert Banner */}
        <View style={styles.alertBanner}>
          <Text style={styles.alertText}>⚠ Low water levels near Narrows Channel</Text>
        </View>

                {/* Featured Marina Card */}
        {marina && (
          <View style={styles.card}>
            <Text style={styles.featuredLabel}> Featured</Text>
            <Text style={styles.marinaName}>{marina.name}</Text>
            {marina.lake && <Text style={styles.marinaDetail}> {marina.lake}</Text>}
            {marina.address && <Text style={styles.marinaDetail}> {marina.address}</Text>}
            {marina.phone && <Text style={styles.marinaDetail}>  {marina.phone}</Text>}

            <View style={styles.tagRow}>
              {(marina.amenities ?? []).map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={styles.directionsButton}>
              <Text style={styles.directionsButtonText}>🧭  Get Directions</Text>
            </TouchableOpacity>
          </View>
        )}
        
         {/* Weather */}
        {weather ? (
          <>
            {/* Feels like + UV */}
            <View style={styles.weatherRow}>
              <View style={[styles.card, styles.halfCard]}>
                <Text style={styles.miniLabel}>FEELS LIKE</Text>
                <Text style={styles.bigValue}>{weather.feelsLike}°</Text>
                <Text style={styles.miniSub}>Actual: {weather.temp}°</Text>
              </View>
              <View style={[styles.card, styles.halfCard]}>
                <Text style={styles.miniLabel}>UV INDEX</Text>
                <Text style={styles.bigValue}>{weather.uvIndex}</Text>
                <Text style={styles.miniSub}>{uvLabel(weather.uvIndex)}</Text>
              </View>
            </View>

            {/* Wind + compass */}
            <View style={styles.card}>
              <Text style={styles.miniLabel}>WIND</Text>
              <View style={styles.windRow}>
                <View style={styles.windStats}>
                  <View style={styles.windStatRow}>
                    <Text style={styles.windStatLabel}>Wind</Text>
                    <Text style={styles.windStatValue}>{weather.windSpeed} km/h</Text>
                  </View>
                  <View style={styles.windStatRow}>
                    <Text style={styles.windStatLabel}>Gusts</Text>
                    <Text style={styles.windStatValue}>{weather.windGust} km/h</Text>
                  </View>
                  <View style={styles.windStatRow}>
                    <Text style={styles.windStatLabel}>Direction</Text>
                    <Text style={styles.windStatValue}>
                      {weather.windDirection}° {degToCompass(weather.windDirection)}
                    </Text>
                  </View>
                </View>
                <WindCompass windSpeed={weather.windSpeed} windDirection={weather.windDirection} />
              </View>
            </View>

            {/* Other conditions */}
            <View style={styles.card}>
              <View style={styles.conditionsGrid}>
                <View style={styles.conditionCell}>
                  <Text style={styles.conditionValue}>{weather.humidity}%</Text>
                  <Text style={styles.conditionLabel}>Humidity</Text>
                </View>
                <View style={styles.conditionCell}>
                  <Text style={styles.conditionValue}>{weather.precipitation}mm</Text>
                  <Text style={styles.conditionLabel}>Precipitation</Text>
                </View>
                <View style={styles.conditionCell}>
                  <Text style={styles.conditionValue}>{weather.sunrise}</Text>
                  <Text style={styles.conditionLabel}>Sunrise</Text>
                </View>
                <View style={styles.conditionCell}>
                  <Text style={styles.conditionValue}>{weather.temp}°C</Text>
                  <Text style={styles.conditionLabel}>Temp</Text>
                </View>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.card}>
            <Text style={styles.conditionLabel}>Loading conditions…</Text>
          </View>
        )}

                {/* This Week at the Dock */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>This Week at the Dock</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.weekScroll}>
            {(weather?.week ?? []).map((day, i) => (
              <View key={i} style={styles.dayCard}>
                <Text style={styles.dayLabel}>{day.label}</Text>
                <MaterialCommunityIcons
                  name={day.icon as any}
                  size={24}
                  color={Colors.gold}
                  style={styles.dayCondition}
                />
                <Text style={styles.dayTemp}>{day.high}°C</Text>
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
    weatherRow: {
    flexDirection: 'row',
    gap: 12,
  },
  halfCard: {
    flex: 1,
  },
  miniLabel: {
    color: '#8899AA',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  bigValue: {
    color: Colors.cream,
    fontSize: 34,
    fontWeight: '700',
  },
  miniSub: {
    color: '#8899AA',
    fontSize: 13,
    marginTop: 2,
  },
  windRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  windStats: {
    flex: 1,
    paddingRight: 12,
  },
  windStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  windStatLabel: {
    color: Colors.cream,
    fontSize: 15,
  },
  windStatValue: {
    color: '#8899AA',
    fontSize: 15,
  },
    
});
