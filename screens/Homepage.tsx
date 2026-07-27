import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ImageBackground, Linking, Alert, Image, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Colors } from '../constants/colors';
import { useEffect, useState, useCallback } from 'react';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons} from '@expo/vector-icons';
import { getWeather, Weather} from '../lib/weather';
import { Marina, loadHomeData, getCachedHomeData } from '../lib/homeData';
import { useAccount } from '../contexts/AccountContext';
import WindCompass from './components/WindCompass';

// shown behind the marina name if a marina has no image_url yet
const MARINA_FALLBACK = 'https://images.unsplash.com/photo-1545671913-b89ac1b4ac10?w=1200&q=80';

// dark gradient over the marina photo so text stays readable
const HERO_OVERLAY = ['rgba(0,0,0,0.25)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)'] as const;

// the colorful Spotlight promo block
const SPOTLIGHT_GRADIENT = ['#F7825F', '#C2A24E'] as const;

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

// weather icon -> a two-stop sky gradient (time-of-day / condition color)
function skyGradient(icon: string): readonly [string, string] {
  if (icon.includes('sunny')) return ['#3A7BD5', '#C2A24E'];
  if (icon.includes('partly')) return ['#3A6073', '#16222A'];
  if (icon.includes('pouring') || icon.includes('rainy')) return ['#283E51', '#4B79A1'];
  if (icon.includes('lightning')) return ['#373B44', '#4286F4'];
  if (icon.includes('snow')) return ['#83A4D4', '#3A4A5A'];
  return ['#3A4A5A', '#1B2A3B'];
}

// weather icon -> plain-English condition
function iconToText(icon: string) {
  const map: Record<string, string> = {
    'weather-sunny': 'Clear',
    'weather-partly-cloudy': 'Partly cloudy',
    'weather-cloudy': 'Cloudy',
    'weather-fog': 'Foggy',
    'weather-rainy': 'Light rain',
    'weather-pouring': 'Rain',
    'weather-snowy': 'Snow',
    'weather-lightning': 'Thunderstorms',
  };
  return map[icon] ?? 'Cloudy';
}
export default function Homepage(){
  // holds the featured marina once it loads (null until then)
  const [marina, setMarina] = useState<Marina | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  // marina: null until an admin approves + links the marina application
  const { accountType, marina: ownedMarina, loading: accountLoading } = useAccount();

    // Splash usually already prefetched this data in parallel with its own
    // logo display — if so, use it immediately with no loader. Otherwise
    // (e.g. arriving via Login/Onboarding instead of Splash), fetch it here
    // and show the loading gate just this once.
  useEffect(() => {
    async function loadMarina() {
      const cached = getCachedHomeData();
      if (cached.hasCached) {
        setMarina(cached.marina);
        setWeather(cached.weather);
        setReady(true);
        return;
      }

      try {
        const { marina, weather } = await loadHomeData();
        setMarina(marina);
        setWeather(weather);
      } finally {
        setReady(true);
      }
    }
    loadMarina();
  }, []);   // empty array = run once on mount

  // refresh weather whenever the Home tab regains focus, so it doesn't go stale
  // (getWeather has a 15-min cache, so this won't hammer the API)
  useFocusEffect(
    useCallback(() => {
      if (marina?.latitude != null && marina?.longitude != null) {
        getWeather(marina.latitude, marina.longitude).then(setWeather);
      }
    }, [marina])
  );

  // pull-to-refresh: force a fresh fetch of marina + weather
  async function onRefresh() {
    setRefreshing(true);
    try {
      const { marina, weather } = await loadHomeData();
      setMarina(marina);
      setWeather(weather);
    } finally {
      setRefreshing(false);
    }
  }

  // open the user's chosen maps app, routed to the featured marina.
  // Prefer the street address so the map geocodes to the exact spot and shows
  // a real address label; fall back to coordinates only if we have no address.
  function openDirections() {
    if (!marina) return;
    const { name, address, latitude: lat, longitude: lng } = marina;
    const destination = address?.trim()
      ? address.trim()
      : lat != null && lng != null
        ? `${lat},${lng}`
        : null;
    if (!destination) return;
    const dest = encodeURIComponent(destination);
    Alert.alert('Get Directions', `Open directions to ${name}?`, [
      {
        text: 'Apple Maps',
        onPress: () => Linking.openURL(`http://maps.apple.com/?daddr=${dest}`),
      },
      {
        text: 'Google Maps',
        onPress: () =>
          Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dest}`),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  if (!ready) {
    return (
      <View style={styles.loadingRoot}>
        <Image source={require('../assets/narrows-logo-clear.png')} style={styles.loadingLogo} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 46 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
      >
        {/* Marina account, still under manual review — visible right away on
            login rather than only inside the Requests tab */}
        {!accountLoading && accountType === 'marina' && !ownedMarina && (
          <View style={styles.alertBanner}>
            <Ionicons name="hourglass-outline" size={16} color={Colors.gold} />
            <Text style={styles.alertText}>
              Your marina is waiting on approval — we'll notify you once it's live.
            </Text>
          </View>
        )}

        {/* Water alert — only shows when a marina has an active alert */}
        {marina?.water_alert ? (
          <View style={styles.alertBanner}>
            <Ionicons name="warning-outline" size={16} color={Colors.gold} />
            <Text style={styles.alertText}>{marina.water_alert}</Text>
          </View>
        ) : null}

        {/* 1. Weather hero — at the top */}
        {weather && (
          <LinearGradient
            colors={skyGradient(weather.week[0].icon)}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.weatherHero}
          >
            <View>
              <Text style={styles.weatherHeroCond}>{iconToText(weather.week[0].icon)}</Text>
              <Text style={styles.weatherHeroTemp}>{weather.temp}°</Text>
              <Text style={styles.weatherHeroSub}>Feels like {weather.feelsLike}°</Text>
            </View>
            <MaterialCommunityIcons
              name={weather.week[0].icon as any}
              size={64}
              color="rgba(255,255,255,0.92)"
            />
          </LinearGradient>
        )}

        {/* 2. Featured Marina — full-bleed photo hero */}
        {marina && (
          <TouchableOpacity
            activeOpacity={0.92}
            onPress={() => navigation.navigate('MarinaProfile', { marinaId: marina.id })}
          >
          <ImageBackground
            source={{ uri: marina.image_url || MARINA_FALLBACK }}
            style={styles.marinaHero}
            imageStyle={styles.marinaHeroImage}
          >
            <LinearGradient colors={HERO_OVERLAY} style={StyleSheet.absoluteFill} />
            <View style={styles.marinaHeroContent}>
              <Text style={styles.featuredLabel}>FEATURED</Text>
              <Text style={styles.marinaName}>{marina.name}</Text>
              {marina.lake && <Text style={styles.marinaDetail}>{marina.lake}</Text>}
              {marina.address && <Text style={styles.marinaDetail}>{marina.address}</Text>}
              {marina.phone && <Text style={styles.marinaDetail}>{marina.phone}</Text>}

              <View style={styles.tagRow}>
                {(marina.amenities ?? []).map((tag) => (
                  <View key={tag} style={styles.tag}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity style={styles.directionsButton} onPress={openDirections}>
                <Ionicons name="navigate" size={16} color={Colors.black} />
                <Text style={styles.directionsButtonText}>Get Directions</Text>
              </TouchableOpacity>
            </View>
          </ImageBackground>
          </TouchableOpacity>
        )}

        {weather ? (
          <>
            {/* 2. Wind + compass */}
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
                    <Text style={styles.windStatLabel}>Heading towards</Text>
                    <Text style={styles.windStatValue}>
                      {(weather.windDirection + 180) % 360}° {degToCompass((weather.windDirection + 180) % 360)}
                    </Text>
                  </View>
                </View>
                <WindCompass windSpeed={weather.windSpeed} windDirection={weather.windDirection} />
              </View>
            </View>

            {/* 3. Spotlight — colorful promo block */}
            <LinearGradient
              colors={SPOTLIGHT_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.spotlight}
            >
              <View style={styles.spotlightText}>
                <Text style={styles.spotlightKicker}>SPOTLIGHT</Text>
                <Text style={styles.spotlightTitle}>Summer on the water</Text>
                <Text style={styles.spotlightSub}>Events, fuel deals & marina news all season.</Text>
                <TouchableOpacity style={styles.spotlightBtn} onPress={() => navigation.navigate('Events')}>
                  <Text style={styles.spotlightBtnText}>Explore</Text>
                </TouchableOpacity>
              </View>
              <Ionicons name="boat" size={56} color="rgba(255,255,255,0.85)" />
            </LinearGradient>

            {/* 5. UV | Humidity (compact) */}
            <View style={styles.weatherRow}>
              <View style={styles.statCard}>
                <Text style={styles.miniLabel}>UV INDEX</Text>
                <Text style={styles.statValue}>{weather.uvIndex}</Text>
                <Text style={styles.miniSub}>{uvLabel(weather.uvIndex)}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.miniLabel}>HUMIDITY</Text>
                <Text style={styles.statValue}>{weather.humidity}%</Text>
              </View>
            </View>

            {/* 6. Sunrise + Sunset — combined card */}
            <View style={styles.sunCard}>
              <View style={styles.sunHalf}>
                <Text style={styles.miniLabel}>SUNRISE</Text>
                <Text style={styles.statValue}>{weather.sunrise}</Text>
              </View>
              <View style={styles.sunDivider} />
              <View style={styles.sunHalf}>
                <Text style={styles.miniLabel}>SUNSET</Text>
                <Text style={styles.statValue}>{weather.sunset}</Text>
              </View>
            </View>

            {/* 6. This Week at the Dock */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>This Week at the Dock</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.weekScroll}>
                {weather.week.map((day, i) => (
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
          </>
        ) : (
          <View style={styles.card}>
            <Text style={styles.conditionLabel}>Loading conditions…</Text>
          </View>
        )}
      </ScrollView>

      {/* Floating frosted header — stays put as you scroll */}
      <View style={[styles.floatingHeader, { height: insets.top + 44, paddingTop: insets.top }]}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.headerInner}>
          <Text style={styles.headerTitle}>Narrows</Text>
        </View>
      </View>
    </View>
  );

}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingRoot: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingLogo: {
    width: 120,
    height: 120,
  },
  // Floating frosted header
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  // Compact stat tile
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 16,
  },
  statValue: {
    color: Colors.cream,
    fontSize: 24,
    fontWeight: '700',
    marginTop: 6,
  },
  // Combined sunrise/sunset card
  sunCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
  },
  sunHalf: {
    flex: 1,
  },
  sunDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 8,
  },
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 120, // clear the floating tab bar
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
    letterSpacing: 2,
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

  // Alert — floating pill
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  alertText: {
    color: Colors.gold,
    fontSize: 13,
    fontWeight: '600',
  },

  // Cards — borderless, the surface contrast does the work
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
  },

  // Marina photo hero
  marinaHero: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 14,
    minHeight: 320,
    justifyContent: 'flex-end',
  },
  marinaHeroImage: {
    borderRadius: 20,
  },
  marinaHeroContent: {
    padding: 18,
  },

  // Spotlight promo block
  spotlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
  },
  spotlightText: {
    flex: 1,
  },
  spotlightKicker: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  spotlightTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 4,
  },
  spotlightSub: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    marginBottom: 12,
  },
  spotlightBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  spotlightBtnText: {
    color: '#8A4A24',
    fontWeight: '700',
    fontSize: 13,
  },

  // Weather gradient hero
  weatherHero: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
  },
  weatherHeroCond: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '600',
  },
  weatherHeroTemp: {
    color: '#FFFFFF',
    fontSize: 52,
    fontWeight: '700',
    lineHeight: 56,
  },
  weatherHeroSub: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
  },
  featuredLabel: {
    color: Colors.gold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  marinaName: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  marinaDetail: {
    color: 'rgba(255,255,255,0.82)',
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
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagText: {
    color: Colors.cream,
    fontSize: 12,
  },

  // Directions button
  directionsButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.gold,
    borderRadius: 14,
    padding: 14,
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
    color: Colors.muted,
    fontSize: 13,
    marginTop: 2,
  },

  // Weekly scroll
  weekScroll: {
    marginTop: 4,
  },
  dayCard: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    marginRight: 10,
    width: 64,
  },
  dayLabel: {
    color: Colors.muted,
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
    marginBottom: 14,
  },
  halfCard: {
    flex: 1,
  },
  miniLabel: {
    color: Colors.muted,
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
  boxValue: {
    color: Colors.cream,
    fontSize: 26,
    fontWeight: '700',
  },
  miniSub: {
    color: Colors.muted,
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
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  windStatLabel: {
    color: Colors.cream,
    fontSize: 15,
  },
  windStatValue: {
    color: Colors.muted,
    fontSize: 15,
  },
    
});
