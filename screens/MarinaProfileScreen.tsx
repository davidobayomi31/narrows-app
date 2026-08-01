import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ImageBackground,
  Linking,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { WINTERIZATION_REQUESTS_LIVE } from '../constants/features';
import { supabase } from '../lib/supabase';
import WinterizeRequestModal from './components/WinterizeRequestModal';
import BookingRequestModal from './components/BookingRequestModal';
import WinterizationRequestCard from './components/WinterizationRequestCard';
import ChatModal from './components/ChatModal';
import { BOOKING_TYPES, ListingType } from '../lib/bookingTypes';

const MARINA_FALLBACK = 'https://images.unsplash.com/photo-1545671913-b89ac1b4ac10?w=1200&q=80';
const HERO_OVERLAY = ['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.92)'] as const;

const BADGE_COLORS: Record<string, string> = {
  TRIP: '#1B4FD8',
  CATCH: '#166534',
  CHECK: '#92400E',
};

const screenW = Dimensions.get('window').width;
const TILE = (screenW - 32 - 16) / 3;

export default function MarinaProfileScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { marinaId } = route.params;

  const [marina, setMarina] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWinterize, setShowWinterize] = useState(false);
  // which generalized request-flow modal is open (slip/mooring/storage), if any
  const [bookingType, setBookingType] = useState<ListingType | null>(null);
  const [listingTypes, setListingTypes] = useState<string[]>([]);
  const [showChat, setShowChat] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [unreadMessages, setUnreadMessages] = useState(0);

  useFocusEffect(
    useCallback(() => {
      loadMarina();
      loadUnreadMessages();
    }, [marinaId])
  );

  // a tapped "new message" notification passes openChat -- jump straight
  // into the thread instead of making the boater find the icon themselves.
  useEffect(() => {
    if (route.params?.openChat) {
      setShowChat(true);
      navigation.setParams({ openChat: undefined, openChatNonce: undefined });
    }
  }, [route.params?.openChatNonce]);

  async function loadUnreadMessages() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setMyUserId(user.id);
    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('marina_id', marinaId)
      .eq('boater_id', user.id)
      .neq('sender_id', user.id)
      .is('read_at', null);
    setUnreadMessages(count || 0);
  }

  async function loadMarina() {
    const { data: marinaData } = await supabase
      .from('marinas')
      .select('*')
      .eq('id', marinaId)
      .single();

    if (marinaData) {
      setMarina(marinaData);
      if (marinaData.profile_id) {
        const { data: postsData } = await supabase
          .from('posts')
          .select('*')
          .eq('user_id', marinaData.profile_id)
          .order('created_at', { ascending: false });
        setPosts(postsData || []);
      }
    }

    // which booking types this marina actually offers — drives which "Book X"
    // buttons render. A marina with no seadoo listing shows no rental button.
    const { data: listingRows } = await supabase
      .from('marina_listings')
      .select('listing_type')
      .eq('marina_id', marinaId)
      .eq('active', true);
    setListingTypes([...new Set((listingRows ?? []).map((l) => l.listing_type))]);

    if (WINTERIZATION_REQUESTS_LIVE) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // every booking type now — the joined listing_type labels each card.
        const { data: reqData } = await supabase
          .from('bookings')
          .select('*, marina_listings!inner(listing_type, name)')
          .eq('marina_id', marinaId)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        setMyRequests(reqData || []);
      }
    }

    setLoading(false);
  }

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

  if (loading || !marina) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingRoot}>
          <Text style={styles.loadingText}>Loading marina…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ImageBackground
          source={{ uri: marina.image_url || MARINA_FALLBACK }}
          style={styles.hero}
          imageStyle={styles.heroImage}
        >
          <LinearGradient colors={HERO_OVERLAY} style={StyleSheet.absoluteFill} />
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={Colors.cream} />
          </TouchableOpacity>

          {marina.profile_id && (
            <TouchableOpacity style={styles.messageButton} onPress={() => setShowChat(true)} hitSlop={10}>
              <Ionicons name="paper-plane-outline" size={20} color={Colors.cream} />
              {unreadMessages > 0 && (
                <View style={styles.messageBadge}>
                  <Text style={styles.messageBadgeText}>{unreadMessages > 9 ? '9+' : unreadMessages}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          <View style={styles.heroContent}>
            <View style={styles.nameRow}>
              <Text style={styles.marinaName}>{marina.name}</Text>
              <Ionicons name="checkmark-circle" size={20} color={Colors.gold} style={{ marginLeft: 6 }} />
            </View>
            {marina.lake && <Text style={styles.detail}>{marina.lake}</Text>}
            {marina.address && <Text style={styles.detail}>{marina.address}</Text>}
            {marina.phone && <Text style={styles.detail}>{marina.phone}</Text>}

            <View style={styles.tagRow}>
              {(marina.amenities ?? []).map((tag: string) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={styles.directionsButton} onPress={openDirections}>
              <Ionicons name="navigate" size={16} color={Colors.black} />
              <Text style={styles.directionsButtonText}>Get Directions</Text>
            </TouchableOpacity>

            {WINTERIZATION_REQUESTS_LIVE && marina.winterization_enabled && (
              <TouchableOpacity
                style={styles.winterizeButton}
                onPress={() => setShowWinterize(true)}
              >
                <Ionicons name="snow" size={16} color={Colors.cream} />
                <Text style={styles.winterizeButtonText}>Winterize My Boat</Text>
              </TouchableOpacity>
            )}

            {/* one "Book X" button per request-flow type this marina offers */}
            {WINTERIZATION_REQUESTS_LIVE &&
              (Object.keys(BOOKING_TYPES) as ListingType[])
                .filter((t) => BOOKING_TYPES[t].requestFlow && listingTypes.includes(t))
                .map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={styles.winterizeButton}
                    onPress={() => setBookingType(t)}
                  >
                    <Ionicons name={BOOKING_TYPES[t].icon} size={16} color={Colors.cream} />
                    <Text style={styles.winterizeButtonText}>{BOOKING_TYPES[t].buttonText}</Text>
                  </TouchableOpacity>
                ))}
          </View>
        </ImageBackground>

        {myRequests.length > 0 && (
          <View style={styles.requestsSection}>
            <Text style={styles.sectionTitle}>
              Your Request{myRequests.length > 1 ? 's' : ''}
            </Text>
            {myRequests.map((r) => (
              <WinterizationRequestCard key={r.id} request={r} onPaid={loadMarina} />
            ))}
          </View>
        )}

        <View style={styles.postsSection}>
          <Text style={styles.sectionTitle}>Posts</Text>
          {posts.length === 0 ? (
            <Text style={styles.empty}>No posts from this marina yet.</Text>
          ) : (
            <View style={styles.grid}>
              {posts.map((post) => (
                <View key={post.id} style={styles.tile}>
                  {post.video_url ? (
                    <View style={styles.tileImage}>
                      <VideoThumb uri={post.video_url} />
                      <Ionicons name="play-circle" size={22} color="rgba(255,255,255,0.9)" style={styles.tilePlayIcon} />
                    </View>
                  ) : post.image_url ? (
                    <Image source={{ uri: post.image_url }} style={styles.tileImage} />
                  ) : (
                    <View style={styles.tileFallback}>
                      <View style={[styles.tileBadge, { backgroundColor: BADGE_COLORS[post.type] }]}>
                        <Text style={styles.tileBadgeText}>{post.type}</Text>
                      </View>
                      <Text style={styles.tileCaption} numberOfLines={3}>{post.caption}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <WinterizeRequestModal
        visible={showWinterize}
        marinaId={marina.id}
        marinaProfileId={marina.profile_id ?? null}
        onClose={() => setShowWinterize(false)}
        onSubmitted={() => { setShowWinterize(false); loadMarina(); }}
      />

      {bookingType && (
        <BookingRequestModal
          visible={bookingType != null}
          marinaId={marina.id}
          marinaProfileId={marina.profile_id ?? null}
          listingType={bookingType}
          onClose={() => setBookingType(null)}
          onSubmitted={() => { setBookingType(null); loadMarina(); }}
        />
      )}

      {myUserId && (
        <ChatModal
          visible={showChat}
          marinaId={marina.id}
          boaterId={myUserId}
          otherPartyUserId={marina.profile_id ?? null}
          headerTitle={marina.name}
          onClose={() => setShowChat(false)}
          onRead={loadUnreadMessages}
        />
      )}
    </SafeAreaView>
  );
}

// paused first-frame thumbnail for a video post tile in the grid.
function VideoThumb({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return <VideoView player={player} style={{ width: '100%', height: '100%' }} contentFit="cover" nativeControls={false} />;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  loadingRoot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: Colors.muted, fontSize: 14 },
  scrollContent: { paddingBottom: 60 },

  hero: {
    minHeight: 380,
    justifyContent: 'flex-end',
  },
  heroImage: {},
  backButton: {
    position: 'absolute',
    top: 56,
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageButton: {
    position: 'absolute',
    top: 56,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  messageBadgeText: { color: Colors.black, fontSize: 10, fontWeight: '700' },
  heroContent: {
    padding: 20,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  marinaName: { color: '#FFFFFF', fontSize: 26, fontWeight: 'bold' },
  detail: { color: 'rgba(255,255,255,0.82)', fontSize: 14, marginTop: 4 },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 16 },
  tag: { backgroundColor: Colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { color: Colors.cream, fontSize: 12 },

  directionsButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.gold,
    borderRadius: 14,
    padding: 14,
  },
  directionsButtonText: { color: Colors.black, fontWeight: '700', fontSize: 15 },

  winterizeButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
  },
  winterizeButtonText: { color: Colors.cream, fontWeight: '700', fontSize: 15 },

  requestsSection: { paddingHorizontal: 16, paddingTop: 20 },
  postsSection: { paddingHorizontal: 16, paddingTop: 20 },
  sectionTitle: { color: Colors.cream, fontSize: 16, fontWeight: '700', marginBottom: 16 },
  empty: { color: Colors.muted, fontSize: 14, textAlign: 'center', marginTop: 12 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: TILE, height: TILE, borderRadius: 12, overflow: 'hidden', backgroundColor: Colors.surface },
  tileImage: { width: '100%', height: '100%' },
  tilePlayIcon: { position: 'absolute', top: 6, right: 6 },
  tileFallback: { flex: 1, padding: 8 },
  tileBadge: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginBottom: 6 },
  tileBadgeText: { color: Colors.white, fontSize: 9, fontWeight: '700' },
  tileCaption: { color: Colors.muted, fontSize: 11, lineHeight: 15 },
});
