import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Share,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback } from 'react';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import { Colors } from '../constants/colors';
import { supabase } from '../lib/supabase';
import { useUnits } from '../contexts/UnitsContext';
import CommentsModal from './components/CommentsModal';

const BADGE_COLORS: Record<string, string> = { TRIP: '#1B4FD8', CATCH: '#166534', CHECK: '#92400E' };

const AVATAR_COLORS = ['#2E4057', '#5B6C3F', '#7A4E2E', '#4A5D7E', '#6B4E71', '#3F6B5E', '#8A5A44', '#5A4E8A'];
function getAvatarColor(name: string) {
  const letter = name?.[0]?.toUpperCase() || 'B';
  return AVATAR_COLORS[letter.charCodeAt(0) % AVATAR_COLORS.length];
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function PostDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { postId } = route.params;
  const { formatDistance, formatDuration } = useUnits();

  const [post, setPost] = useState<any>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadPost();
    }, [postId])
  );

  async function loadPost() {
    const { data: postData } = await supabase.from('posts').select('*').eq('id', postId).single();
    if (!postData) return;

    const { data: author } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, region')
      .eq('id', postData.user_id)
      .single();
    const { data: likesData } = await supabase.from('likes').select('user_id').eq('post_id', postId);
    const { count: commentCount } = await supabase
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', postId);
    const { data: { user } } = await supabase.auth.getUser();

    setPost({
      ...postData,
      author,
      likeCount: likesData?.length || 0,
      likedByMe: (likesData || []).some((l) => l.user_id === user?.id),
      commentCount: commentCount || 0,
    });
  }

  async function toggleLike() {
    if (!post) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (post.likedByMe) {
      await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', user.id);
    } else {
      await supabase.from('likes').insert({ post_id: post.id, user_id: user.id });
    }
    loadPost();
  }

  async function sharePost() {
    if (!post) return;
    try {
      let localUri: string | undefined;
      if (post.image_url) {
        const file = await File.downloadFileAsync(post.image_url, Paths.cache);
        localUri = file.uri;
      }
      await Share.share({
        message: `${post.caption ? post.caption + '\n\n' : ''}Shared via Narrows 🚤 narrows.site`,
        url: localUri,
      });
    } catch {
      Alert.alert('Could not share', 'Something went wrong sharing this post.');
    }
  }

  if (!post) {
    return <SafeAreaView style={styles.safeArea} />;
  }

  const name = `${post.author?.first_name || 'Boater'} ${post.author?.last_name || ''}`;

  const detailParts: string[] = [];
  if (post.type === 'TRIP') {
    if (post.duration_hours) detailParts.push(formatDuration(post.duration_hours));
    if (post.distance_km) detailParts.push(formatDistance(post.distance_km));
    if (post.location) detailParts.push(post.location);
    if (post.conditions) detailParts.push(post.conditions);
  } else if (post.type === 'CATCH') {
    if (post.species) detailParts.push(post.species);
    if (post.location) detailParts.push(post.location);
  } else if (post.type === 'CHECK') {
    if (post.location) detailParts.push(post.location);
  }
  const detail = detailParts.join('  ·  ');

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={Colors.cream} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.post}>
          {/* header */}
          <View style={styles.postHeader}>
            <View style={[styles.avatar, { backgroundColor: getAvatarColor(post.author?.first_name) }]}>
              <Text style={styles.avatarText}>{post.author?.first_name?.[0] || 'B'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{name}</Text>
              <Text style={styles.sub}>{timeAgo(post.created_at)} · {post.author?.region || ''}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: BADGE_COLORS[post.type] }]}>
              <Text style={styles.badgeText}>{post.type}</Text>
            </View>
          </View>

          {detail ? <Text style={styles.detail}>{detail}</Text> : null}

          {post.image_url ? (
            <Image source={{ uri: post.image_url }} style={styles.postImage} />
          ) : null}

          {/* actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionBtn} hitSlop={8} onPress={toggleLike}>
              <MaterialCommunityIcons name="anchor" size={24} color={post.likedByMe ? Colors.gold : Colors.cream} />
              <Text style={styles.actionCount}>{post.likeCount}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} hitSlop={8} onPress={() => setCommentsOpen(true)}>
              <Ionicons name="chatbubble-outline" size={22} color={Colors.cream} />
              <Text style={styles.actionCount}>{post.commentCount}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} hitSlop={8} onPress={sharePost}>
              <Ionicons name="share-outline" size={22} color={Colors.cream} />
            </TouchableOpacity>
          </View>

          {post.caption ? (
            <View style={styles.captionWrap}>
              <Text style={styles.caption}>
                <Text style={styles.captionName}>{name} </Text>
                {post.caption}
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <CommentsModal
        visible={commentsOpen}
        postId={post.id}
        postOwnerId={post.user_id}
        onClose={() => setCommentsOpen(false)}
        onCommentAdded={loadPost}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6 },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  backText: { color: Colors.cream, fontSize: 16, marginLeft: 2 },
  scrollContent: { paddingBottom: 40 },

  post: { paddingBottom: 14 },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.cream, fontWeight: 'bold', fontSize: 15 },
  name: { color: Colors.cream, fontWeight: '600', fontSize: 14 },
  sub: { color: Colors.muted, fontSize: 12, marginTop: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { color: Colors.white, fontSize: 11, fontWeight: '700' },

  detail: { color: Colors.gold, fontSize: 13, fontWeight: '600', paddingHorizontal: 12, marginBottom: 8 },
  postImage: { width: '100%', aspectRatio: 1, backgroundColor: Colors.surface },

  actions: { flexDirection: 'row', gap: 18, paddingHorizontal: 12, paddingTop: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionCount: { color: Colors.cream, fontSize: 14, fontWeight: '600' },

  captionWrap: { paddingHorizontal: 12, paddingTop: 6 },
  caption: { color: Colors.cream, fontSize: 14, lineHeight: 19 },
  captionName: { fontWeight: '700' },
});
