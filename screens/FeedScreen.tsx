import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { Colors } from '../constants/colors';
import { supabase } from '../lib/supabase';
import PostComposer from './components/PostComposer';

const FILTER = ['All', 'Trips', 'Catches', 'Check-ins'];

// which post type each filter tab shows ('All' shows everything)
const FILTER_TYPE: Record<string, string> = {
  Trips: 'TRIP',
  Catches: 'CATCH',
  'Check-ins': 'CHECK',
};

const BADGE_COLORS: Record<string, string> = {
  TRIP: '#1B4FD8',
  CATCH: '#166534',
  CHECK: '#92400E',
};

const AVATAR_COLORS = ['#2E4057', '#5B6C3F', '#7A4E2E', '#4A5D7E', '#6B4E71', '#3F6B5E', '#8A5A44', '#5A4E8A'];

function getAvatarColor(name: string) {
  const letter = name?.[0]?.toUpperCase() || 'B';
  return AVATAR_COLORS[letter.charCodeAt(0) % AVATAR_COLORS.length];
}

// turns a timestamp into "5m ago", "3h ago", "2d ago"
function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function FeedScreen() {
  const [activeFilter, setActiveFilter] = useState('All');
  const [posts, setPosts] = useState<any[]>([]);
  const [showComposer, setShowComposer] = useState(false);

  useEffect(() => {
    loadPosts();
  }, []);

  async function loadPosts() {
    // 1. all posts, newest first
    const { data: postsData, error } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.log(error.message);
      return;
    }

    // 2. all profiles (to get each author's name)
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, region');

    // 3. attach the matching profile to each post
    const merged = (postsData || []).map((post) => ({
      ...post,
      author: profilesData?.find((p) => p.id === post.user_id),
    }));

    setPosts(merged);
  }

  // only show posts matching the active filter
  const visiblePosts =
    activeFilter === 'All'
      ? posts
      : posts.filter((p) => p.type === FILTER_TYPE[activeFilter]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Filter tabs */}
        <View style={styles.filterRow}>
          {FILTER.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterTab, activeFilter === f && styles.filterTabActive]}
              onPress={() => setActiveFilter(f)}
            >
              <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Posts */}
        {visiblePosts.map((post) => {
          const name = `${post.author?.first_name || 'Boater'} ${post.author?.last_name || ''}`;
          return (
            <View key={post.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.avatar, { backgroundColor: getAvatarColor(post.author?.first_name) }]}>
                  <Text style={styles.avatarText}>{post.author?.first_name?.[0] || 'B'}</Text>
                </View>
                <View style={styles.cardMeta}>
                  <Text style={styles.cardName}>{name}</Text>
                  <Text style={styles.cardSub}>
                    {timeAgo(post.created_at)} · {post.author?.region || ''}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: BADGE_COLORS[post.type] }]}>
                  <Text style={styles.badgeText}>{post.type}</Text>
                </View>
              </View>
              <Text style={styles.cardText}>{post.caption}</Text>
              {post.image_url && <Image source={{ uri: post.image_url }} style={styles.postImage} />}
              <TouchableOpacity style={styles.anchorButton}>
                <Text style={styles.anchorText}>⚓</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>

      {/* Floating + button */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowComposer(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Shared composer (create mode) */}
      <PostComposer
        visible={showComposer}
        onClose={() => setShowComposer(false)}
        onSaved={loadPosts}
      />
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
    paddingTop: 12,
    paddingBottom: 96,
  },

  // filter tabs
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2E4057',
  },
  filterTabActive: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  filterText: {
    color: '#8899AA',
    fontSize: 13,
  },
  filterTextActive: {
    color: Colors.black,
    fontWeight: '700',
  },

  // post cards
  card: {
    backgroundColor: '#0F0F0F',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E1E1E',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2E4057',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    color: Colors.cream,
    fontWeight: 'bold',
    fontSize: 16,
  },
  cardMeta: {
    flex: 1,
  },
  cardName: {
    color: Colors.cream,
    fontWeight: '600',
    fontSize: 14,
  },
  cardSub: {
    color: '#8899AA',
    fontSize: 12,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  cardText: {
    color: '#8899AA',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 12,
  },
  anchorButton: {
    alignSelf: 'flex-end',
  },
  anchorText: {
    fontSize: 20,
  },

  // floating action button
  fab: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  fabText: {
    color: Colors.black,
    fontSize: 34,
    fontWeight: '700',
    marginTop: -2,
  },
});
