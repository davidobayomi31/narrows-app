import { useState, useCallback } from 'react';
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
  const [loading, setLoading] = useState(true);
  const [showWinterize, setShowWinterize] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadMarina();
    }, [marinaId])
  );

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
    setLoading(false);
  }

  function openDirections() {
    if (marina?.latitude == null || marina?.longitude == null) return;
    const { latitude: lat, longitude: lng, name } = marina;
    Alert.alert('Get Directions', `Open directions to ${name}?`, [
      {
        text: 'Apple Maps',
        onPress: () =>
          Linking.openURL(`http://maps.apple.com/?daddr=${lat},${lng}&q=${encodeURIComponent(name)}`),
      },
      {
        text: 'Google Maps',
        onPress: () =>
          Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`),
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
          </View>
        </ImageBackground>

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
        onSubmitted={() => setShowWinterize(false)}
      />
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
