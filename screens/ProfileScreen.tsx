import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';
import PostComposer from './components/PostComposer';

const BADGE_COLORS: Record<string, string> = {
  TRIP: '#1B4FD8',
  CATCH: '#166534',
  CHECK: '#92400E',
};

const FILTERS = ['All', 'Trips', 'Catches', 'Check-ins'];
const FILTER_TYPE: Record<string, string> = {
  Trips: 'TRIP',
  Catches: 'CATCH',
  'Check-ins': 'CHECK',
};

const screenW = Dimensions.get('window').width;
const TILE = (screenW - 32 - 16) / 3; // 16px side padding(32) + two 8px gaps(16)

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const [profile, setProfile] = useState<any>(null);
  const [myPosts, setMyPosts] = useState<any[]>([]);
  const [editingPost, setEditingPost] = useState<any>(null);
  const [activeFilter, setActiveFilter] = useState('All');

  useFocusEffect(
    useCallback(() => {
      loadProfile();
      loadMyPosts();
    }, [])
  );

  const stats = [
    { label: 'Trips', value: String(myPosts.filter((p) => p.type === 'TRIP').length) },
    { label: 'Catches', value: String(myPosts.filter((p) => p.type === 'CATCH').length) },
    { label: 'Km', value: String(Math.round(myPosts.reduce((s, p) => s + (p.distance_km || 0), 0) * 10) / 10) },
    { label: 'Hours', value: String(Math.round(myPosts.reduce((s, p) => s + (p.duration_hours || 0), 0) * 10) / 10) },
  ];

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (data) setProfile(data);
  }

  async function loadMyPosts() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setMyPosts(data || []);
  }

  function postMenu(post: any) {
    Alert.alert('Post Options', undefined, [
      { text: 'Edit', onPress: () => setEditingPost(post) },
      { text: 'Delete', style: 'destructive', onPress: () => deletePost(post.id) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function deletePost(id: string) {
    const { error } = await supabase.from('posts').delete().eq('id', id);
    if (error) Alert.alert('Could not delete', friendlyError(error));
    else loadMyPosts();
  }

  const visiblePosts =
    activeFilter === 'All' ? myPosts : myPosts.filter((p) => p.type === FILTER_TYPE[activeFilter]);

  const name = `${profile?.first_name || 'Boater'} ${profile?.last_name || ''}`;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')} hitSlop={10}>
            <Ionicons name="settings-outline" size={24} color={Colors.cream} />
          </TouchableOpacity>
        </View>

        {/* header */}
        <View style={styles.header}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>{profile?.first_name?.[0]?.toUpperCase() || 'B'}</Text>
            </View>
          )}
          <View style={styles.nameRow}>
            <Text style={styles.name}>{name}</Text>
            {profile?.verified && (
              <Ionicons name="checkmark-circle" size={18} color={Colors.gold} style={{ marginLeft: 6 }} />
            )}
          </View>
          {profile?.region ? <Text style={styles.region}>{profile.region}</Text> : null}
          {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
        </View>

        {/* stats */}
        <View style={styles.statsRow}>
          {stats.map((s) => (
            <View key={s.label} style={styles.statCell}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* filter tabs */}
        <View style={styles.tabs}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.tab, activeFilter === f && styles.tabActive]}
              onPress={() => setActiveFilter(f)}
            >
              <Text style={[styles.tabText, activeFilter === f && styles.tabTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* posts grid */}
        {visiblePosts.length === 0 ? (
          <Text style={styles.empty}>Nothing here yet.</Text>
        ) : (
          <View style={styles.grid}>
            {visiblePosts.map((post) => (
              <TouchableOpacity key={post.id} style={styles.tile} onLongPress={() => postMenu(post)}>
                {post.image_url ? (
                  <Image source={{ uri: post.image_url }} style={styles.tileImage} />
                ) : (
                  <View style={styles.tileFallback}>
                    <View style={[styles.tileBadge, { backgroundColor: BADGE_COLORS[post.type] }]}>
                      <Text style={styles.tileBadgeText}>{post.type}</Text>
                    </View>
                    <Text style={styles.tileCaption} numberOfLines={3}>{post.caption}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <PostComposer
        visible={!!editingPost}
        editingPost={editingPost}
        onClose={() => setEditingPost(null)}
        onSaved={loadMyPosts}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 120 },

  topBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 8 },

  header: { alignItems: 'center', marginBottom: 20 },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarPlaceholder: { backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: Colors.cream, fontSize: 34, fontWeight: 'bold' },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  name: { color: Colors.cream, fontSize: 22, fontWeight: 'bold' },
  region: { color: Colors.muted, fontSize: 13, marginTop: 4 },
  bio: { color: Colors.cream, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },

  statsRow: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 20, marginBottom: 20 },
  statCell: { flex: 1, alignItems: 'center', paddingVertical: 16 },
  statValue: { color: Colors.gold, fontSize: 20, fontWeight: 'bold' },
  statLabel: { color: Colors.muted, fontSize: 12, marginTop: 2 },

  tabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.surface },
  tabActive: { backgroundColor: Colors.gold },
  tabText: { color: Colors.muted, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: Colors.black, fontWeight: '700' },

  empty: { color: Colors.muted, fontSize: 14, textAlign: 'center', marginTop: 24 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: TILE, height: TILE, borderRadius: 12, overflow: 'hidden', backgroundColor: Colors.surface },
  tileImage: { width: '100%', height: '100%' },
  tileFallback: { flex: 1, padding: 8 },
  tileBadge: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginBottom: 6 },
  tileBadgeText: { color: Colors.white, fontSize: 9, fontWeight: '700' },
  tileCaption: { color: Colors.muted, fontSize: 11, lineHeight: 15 },
});