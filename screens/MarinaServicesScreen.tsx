import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { BOOKING_REQUESTS_LIVE } from '../constants/features';
import { supabase } from '../lib/supabase';
import WinterizeRequestModal from './components/WinterizeRequestModal';
import BookingRequestModal from './components/BookingRequestModal';
import RentalBookingModal from './components/RentalBookingModal';
import { BOOKING_TYPES, ListingType } from '../lib/bookingTypes';

const screenW = Dimensions.get('window').width;
const CARD = (screenW - 16 * 2 - 12) / 2;

type ServiceTile = {
  key: string;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

// Every bookable service for one marina, as tappable cards — this used to be
// a stack of buttons on MarinaProfileScreen itself, which got long and
// cluttered once a marina offered several services at once. That screen now
// links here with a single "Book a Service" button instead.
export default function MarinaServicesScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { marinaId } = route.params;

  const [marina, setMarina] = useState<any>(null);
  const [listingTypes, setListingTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWinterize, setShowWinterize] = useState(false);
  const [showRental, setShowRental] = useState(false);
  const [bookingType, setBookingType] = useState<ListingType | null>(null);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [marinaId])
  );

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();

    const { data: marinaData } = await supabase
      .from('marinas')
      .select('*')
      .eq('id', marinaId)
      .single();

    // A marina can't book its own services — this screen only exists to
    // start a booking, so a direct nav here (e.g. a stale deep link) has
    // nothing useful to show the owner. MarinaProfileScreen already hides
    // the entry point for this case; this is the defensive backstop.
    if (marinaData?.profile_id && user && marinaData.profile_id === user.id) {
      Alert.alert('Not available', "You can't book services from your own marina.");
      navigation.goBack();
      return;
    }

    if (marinaData) setMarina(marinaData);

    const { data: listingRows } = await supabase
      .from('marina_listings')
      .select('listing_type')
      .eq('marina_id', marinaId)
      .eq('active', true);
    setListingTypes([...new Set((listingRows ?? []).map((l) => l.listing_type))]);

    setLoading(false);
  }

  function closeAndReturn() {
    setShowWinterize(false);
    setShowRental(false);
    setBookingType(null);
    navigation.goBack();
  }

  if (loading || !marina) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingRoot}>
          <Text style={styles.loadingText}>Loading services…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const tiles: ServiceTile[] = [];

  if (BOOKING_REQUESTS_LIVE && marina.winterization_enabled) {
    tiles.push({
      key: 'winterization',
      label: BOOKING_TYPES.winterization.label,
      description: BOOKING_TYPES.winterization.description,
      icon: BOOKING_TYPES.winterization.icon,
      onPress: () => setShowWinterize(true),
    });
  }
  if (BOOKING_REQUESTS_LIVE && listingTypes.includes('rental')) {
    tiles.push({
      key: 'rental',
      label: BOOKING_TYPES.rental.label,
      description: BOOKING_TYPES.rental.description,
      icon: BOOKING_TYPES.rental.icon,
      onPress: () => setShowRental(true),
    });
  }
  if (BOOKING_REQUESTS_LIVE) {
    (Object.keys(BOOKING_TYPES) as ListingType[])
      .filter((t) => BOOKING_TYPES[t].requestFlow && listingTypes.includes(t))
      .forEach((t) => {
        tiles.push({
          key: t,
          label: BOOKING_TYPES[t].label,
          description: BOOKING_TYPES[t].description,
          icon: BOOKING_TYPES[t].icon,
          onPress: () => setBookingType(t),
        });
      });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={Colors.cream} />
        </TouchableOpacity>
        <Text style={styles.title}>{marina.name}</Text>
        <Text style={styles.subtitle}>Choose a service to book</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {tiles.length === 0 ? (
          <Text style={styles.empty}>This marina hasn't listed any bookable services yet.</Text>
        ) : (
          <View style={styles.grid}>
            {tiles.map((tile) => (
              <TouchableOpacity key={tile.key} style={styles.card} onPress={tile.onPress}>
                <View style={styles.cardIcon}>
                  <Ionicons name={tile.icon} size={26} color={Colors.gold} />
                </View>
                <Text style={styles.cardLabel}>{tile.label}</Text>
                <Text style={styles.cardDescription}>{tile.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <WinterizeRequestModal
        visible={showWinterize}
        marinaId={marina.id}
        marinaProfileId={marina.profile_id ?? null}
        onClose={() => setShowWinterize(false)}
        onSubmitted={closeAndReturn}
      />

      {bookingType && (
        <BookingRequestModal
          visible={bookingType != null}
          marinaId={marina.id}
          marinaProfileId={marina.profile_id ?? null}
          marinaHours={marina.hours ?? null}
          listingType={bookingType}
          onClose={() => setBookingType(null)}
          onSubmitted={closeAndReturn}
        />
      )}

      <RentalBookingModal
        visible={showRental}
        marinaId={marina.id}
        marinaProfileId={marina.profile_id ?? null}
        marinaHours={marina.hours ?? null}
        onClose={() => setShowRental(false)}
        onSubmitted={closeAndReturn}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  loadingRoot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: Colors.muted, fontSize: 14 },

  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  backButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  title: { color: Colors.cream, fontSize: 22, fontWeight: 'bold', marginTop: 8 },
  subtitle: { color: Colors.muted, fontSize: 14, marginTop: 4 },

  scrollContent: { paddingHorizontal: 16, paddingBottom: 60 },
  empty: { color: Colors.muted, fontSize: 14, textAlign: 'center', marginTop: 40 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    width: CARD,
    minHeight: CARD,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  cardLabel: { color: Colors.cream, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  cardDescription: { color: Colors.muted, fontSize: 11, lineHeight: 15, textAlign: 'center', marginTop: 6 },
});
