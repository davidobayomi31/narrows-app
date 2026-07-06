import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Pressable,
  RefreshControl,
  Animated,
  Share,
  Alert,
  InteractionManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Colors } from '../constants/colors';
import { supabase } from '../lib/supabase';
import { useUnits } from '../contexts/UnitsContext';
import PostComposer from './components/PostComposer';
import CommentsModal from './components/CommentsModal';
import { REPORT_REASONS, reportContent, blockUser, getHiddenUserIds } from '../lib/safety';

const FILTER = ['All', 'Trips', 'Catches', 'Check-ins'];
const FILTER_TYPE: Record<string, string> = { Trips: 'TRIP', Catches: 'CATCH', 'Check-ins': 'CHECK' };

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

export default function FeedScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { formatDistance, formatDuration } = useUnits();
  const [activeFilter, setActiveFilter] = useState('All');
  const [posts, setPosts] = useState<any[]>([]);
  // mirror of `posts` for use inside timers/effects that shouldn't re-subscribe
  const postsRef = useRef<any[]>([]);
  const [showComposer, setShowComposer] = useState(false);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [commentsPostOwnerId, setCommentsPostOwnerId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const lastTap = useRef<Record<string, number>>({});

  // jump-to-post (from a tapped notification)
  const scrollRef = useRef<ScrollView>(null);
  const postOffsets = useRef<Record<string, number>>({});
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);

  // double-tap "like" pop animation
  const [heartPostId, setHeartPostId] = useState<string | null>(null);
  const heartScale = useRef(new Animated.Value(0)).current;
  const logoPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadPosts();
  }, []);

  // refresh the unread badge whenever Feed regains focus (e.g. after
  // visiting Notifications, which marks everything read).
  // On BLUR (leaving Feed), close any open sheets — a transparent modal left
  // mounted would keep capturing touches and make the feed feel "frozen".
  useFocusEffect(
    useCallback(() => {
      // defer off the transition so the badge refresh can't deadlock the
      // native stack when returning from Notifications (whole-app freeze)
      const task = InteractionManager.runAfterInteractions(() => loadUnreadCount());
      return () => {
        task.cancel();
        // updater form → React skips the re-render when nothing was open,
        // so leaving Feed doesn't churn during the push transition
        setCommentsPostId((v) => (v !== null ? null : v));
        setShowComposer((v) => (v ? false : v));
        setHighlightPostId((v) => (v !== null ? null : v));
      };
    }, [])
  );

  async function loadUnreadCount() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', user.id)
      .eq('read', false);
    setUnreadCount(count || 0);
  }

  // a tapped notification passes focusPostId — scroll to that post and flash it.
  // focusNonce changes every tap so re-tapping the same post re-triggers this.
  useEffect(() => {
    const focusPostId = route.params?.focusPostId as string | undefined;
    if (!focusPostId) return;

    // make sure the post isn't hidden by the current filter
    setActiveFilter('All');

    let highlightTimer: ReturnType<typeof setTimeout>;
    // wait a beat for the (possibly re-filtered) list to lay out, then scroll
    const scrollTimer = setTimeout(() => {
      const y = postOffsets.current[focusPostId];
      if (y != null) {
        scrollRef.current?.scrollTo({ y: Math.max(y - 12, 0), animated: true });
      }
      setHighlightPostId(focusPostId);
      highlightTimer = setTimeout(() => setHighlightPostId(null), 1600);

      if (route.params?.focusType === 'comment') {
        const post = postsRef.current.find((p) => p.id === focusPostId);
        if (post) {
          setCommentsPostId(post.id);
          setCommentsPostOwnerId(post.user_id);
        }
      }
    }, 350);

    // clear the param so navigating back here later doesn't re-fire
    navigation.setParams({ focusPostId: undefined, focusType: undefined });

    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(highlightTimer);
    };
  }, [route.params?.focusNonce]);

    useEffect(() => {
    if (refreshing) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(logoPulse, { toValue: 1.15, duration: 500, useNativeDriver: true }),
          Animated.timing(logoPulse, { toValue: 0.9, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      logoPulse.setValue(1);
    }
  }, [refreshing]);

  function showHeart(postId: string) {
    setHeartPostId(postId);
    heartScale.setValue(0);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1, friction: 4, useNativeDriver: true }),
      Animated.timing(heartScale, { toValue: 0, duration: 250, delay: 450, useNativeDriver: true }),
    ]).start(() => setHeartPostId(null));
  }

  function handleDoubleTap(post: any) {
    const now = Date.now();
    if (now - (lastTap.current[post.id] || 0) < 300) {
      showHeart(post.id);
      if (!post.likedByMe) toggleLike(post); // like, never unlike, on double-tap
    }
    lastTap.current[post.id] = now;
  }

  async function loadPosts() {
    const { data: postsData, error } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.log(error.message);
      return;
    }

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, region');
    const { data: likesData } = await supabase.from('likes').select('post_id, user_id');
    const { data: commentsData } = await supabase.from('comments').select('post_id');
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id ?? null);

    // hide posts from users this user has blocked (or who blocked them)
    const hidden = await getHiddenUserIds();

    const merged = (postsData || [])
      .filter((post) => !hidden.has(post.user_id))
      .map((post) => {
      const postLikes = (likesData || []).filter((l) => l.post_id === post.id);
      return {
        ...post,
        author: profilesData?.find((p) => p.id === post.user_id),
        likeCount: postLikes.length,
        likedByMe: postLikes.some((l) => l.user_id === user?.id),
        commentCount: (commentsData || []).filter((c) => c.post_id === post.id).length,
      };
    });
    setPosts(merged);
    postsRef.current = merged;
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadPosts();
    setRefreshing(false);
  }

  // downloads the post photo locally (if any) so it can be attached to the
  // native share sheet, then shares it with a Narrows text tag
  async function sharePost(post: any) {
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
    } catch (e: any) {
      Alert.alert('Could not share', 'Something went wrong sharing this post.');
    }
  }

  // "⋯" menu on a post: report it, and (if it's not yours) block the author.
  function openPostMenu(post: any) {
    const buttons: any[] = [{ text: 'Report post', onPress: () => reportPost(post) }];
    if (post.user_id !== currentUserId) {
      buttons.push({ text: 'Block user', style: 'destructive', onPress: () => confirmBlock(post) });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Post options', undefined, buttons);
  }

  function reportPost(post: any) {
    const buttons: any[] = REPORT_REASONS.map((reason) => ({
      text: reason,
      onPress: async () => {
        const ok = await reportContent({
          contentType: 'post',
          contentId: post.id,
          contentOwnerId: post.user_id,
          reason,
        });
        Alert.alert(
          ok ? 'Thanks for reporting' : 'Could not report',
          ok ? 'Our team will review this post within 24 hours.' : 'Please try again.'
        );
      },
    }));
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Report post', 'Why are you reporting this?', buttons);
  }

  function confirmBlock(post: any) {
    const name = post.author?.first_name || 'this user';
    Alert.alert(
      'Block user',
      `You won't see posts or comments from ${name}, and they won't see yours.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            const ok = await blockUser(post.user_id);
            if (ok) loadPosts();
            else Alert.alert('Could not block', 'Please try again.');
          },
        },
      ]
    );
  }

  async function toggleLike(post: any) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (post.likedByMe) {
      await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', user.id);
    } else {
      await supabase.from('likes').insert({ post_id: post.id, user_id: user.id });
      if (post.user_id !== user.id) {
        await supabase.from('notifications').insert({
          recipient_id: post.user_id,
          actor_id: user.id,
          type: 'like',
          post_id: post.id,
        });
      }
    }
    loadPosts();
  }

  const visiblePosts =
    activeFilter === 'All' ? posts : posts.filter((p) => p.type === FILTER_TYPE[activeFilter]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* top bar */}
      <View style={styles.topBar}>
        <Text style={styles.brand}>Narrows</Text>
        <View style={styles.topActions}>
          <TouchableOpacity hitSlop={8} onPress={() => navigation.navigate('Notifications')}>
            <Ionicons name="notifications-outline" size={24} color={Colors.cream} />
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.background} />}
      >
        {/* filter tabs */}
        <View style={styles.filterRow}>
          {FILTER.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterTab, activeFilter === f && styles.filterTabActive]}
              onPress={() => setActiveFilter(f)}
            >
              <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>
                {refreshing && (
          <View style={styles.refreshLogo} pointerEvents="none">
            <Animated.Image
              source={require('../assets/narrows-logo-clear.png')}
              style={{ width: 38, height: 38, transform: [{ scale: logoPulse }] }}
              resizeMode="contain"
            />
          </View>
        )}


        {visiblePosts.length === 0 && (
          <Text style={styles.emptyText}>No posts yet — be the first to share your day on the water.</Text>
        )}

        {visiblePosts.map((post) => {
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
            <View
              key={post.id}
              style={[styles.post, highlightPostId === post.id && styles.postHighlight]}
              onLayout={(e) => { postOffsets.current[post.id] = e.nativeEvent.layout.y; }}
            >
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
                {/* report/block only make sense on OTHER people's posts */}
                {post.user_id !== currentUserId && (
                  <TouchableOpacity hitSlop={10} onPress={() => openPostMenu(post)} style={{ marginLeft: 8 }}>
                    <Ionicons name="ellipsis-horizontal" size={20} color={Colors.muted} />
                  </TouchableOpacity>
                )}
              </View>

              {detail ? <Text style={styles.detail}>{detail}</Text> : null}

              {/* full-bleed media */}
              {post.video_url ? (
                <Pressable onPress={() => handleDoubleTap(post)}>
                  <FeedVideoPost uri={post.video_url} style={styles.postImage} />
                  {heartPostId === post.id && (
                    <Animated.View style={[styles.heartOverlay, { transform: [{ scale: heartScale }] }]}>
                      <MaterialCommunityIcons name="anchor" size={96} color="rgba(255,255,255,0.95)" />
                    </Animated.View>
                  )}
                </Pressable>
              ) : post.image_url ? (
                <Pressable onPress={() => handleDoubleTap(post)}>
                  <Image source={{ uri: post.image_url }} style={styles.postImage} />
                  {heartPostId === post.id && (
                    <Animated.View style={[styles.heartOverlay, { transform: [{ scale: heartScale }] }]}>
                      <MaterialCommunityIcons name="anchor" size={96} color="rgba(255,255,255,0.95)" />
                    </Animated.View>
                  )}
                </Pressable>
              ) : null}

              {/* actions (bottom-left, IG style) */}
              <View style={styles.actions}>
                <TouchableOpacity style={styles.actionBtn} hitSlop={8} onPress={() => toggleLike(post)}>
                  <MaterialCommunityIcons
                    name="anchor"
                    size={24}
                    color={post.likedByMe ? Colors.gold : Colors.cream}
                  />
                  <Text style={styles.actionCount}>{post.likeCount}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionBtn}
                  hitSlop={8}
                  onPress={() => {
                    setCommentsPostId(post.id);
                    setCommentsPostOwnerId(post.user_id);
                  }}
                >
                  <Ionicons name="chatbubble-outline" size={22} color={Colors.cream} />
                  <Text style={styles.actionCount}>{post.commentCount}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} hitSlop={8} onPress={() => sharePost(post)}>
                  <Ionicons name="share-outline" size={22} color={Colors.cream} />
                </TouchableOpacity>
              </View>

              {/* caption */}
              <View style={styles.captionWrap}>
                {post.caption ? (
                  <Text style={styles.caption}>
                    <Text style={styles.captionName}>{name} </Text>
                    {post.caption}
                  </Text>
                ) : null}
                {post.commentCount > 0 && (
                  <Text
                    style={styles.viewComments}
                    onPress={() => {
                      setCommentsPostId(post.id);
                      setCommentsPostOwnerId(post.user_id);
                    }}
                  >
                    View all {post.commentCount} comments
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setShowComposer(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <PostComposer visible={showComposer} onClose={() => setShowComposer(false)} onSaved={loadPosts} />
      <CommentsModal
        visible={commentsPostId !== null}
        postId={commentsPostId}
        postOwnerId={commentsPostOwnerId}
        onClose={() => setCommentsPostId(null)}
        onCommentAdded={loadPosts}
      />
    </SafeAreaView>
  );
}

// autoplays muted + looping (Instagram-style); tap the speaker to hear it.
function FeedVideoPost({ uri, style }: { uri: string; style: any }) {
  const [muted, setMuted] = useState(true);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  return (
    <View style={style}>
      <VideoView player={player} style={{ flex: 1 }} contentFit="cover" nativeControls={false} />
      <TouchableOpacity
        style={styles.muteButton}
        hitSlop={10}
        onPress={() => setMuted((m) => !m)}
      >
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color={Colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  brand: { color: Colors.cream, fontSize: 22, fontWeight: 'bold', letterSpacing: 2 },
  topActions: { flexDirection: 'row', gap: 18 },
  unreadBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  unreadBadgeText: { color: Colors.black, fontSize: 10, fontWeight: '700' },

  scrollContent: { paddingBottom: 150 },

  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  filterTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.surface },
  filterTabActive: { backgroundColor: Colors.gold },
  filterText: { color: Colors.muted, fontSize: 13 },
  filterTextActive: { color: Colors.black, fontWeight: '700' },

  emptyText: { color: Colors.muted, fontSize: 14, textAlign: 'center', marginTop: 40 },

  post: {
    paddingBottom: 14,
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  postHighlight: {
    backgroundColor: 'rgba(194,162,78,0.12)', // gold flash when jumped-to from a notification
    borderRadius: 12,
  },
  heartOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.cream, fontWeight: 'bold', fontSize: 15 },
  name: { color: Colors.cream, fontWeight: '600', fontSize: 14 },
  sub: { color: Colors.muted, fontSize: 12, marginTop: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { color: Colors.white, fontSize: 11, fontWeight: '700' },

  detail: { color: Colors.gold, fontSize: 13, fontWeight: '600', paddingHorizontal: 12, marginBottom: 8 },

  postImage: { width: '100%', aspectRatio: 1, backgroundColor: Colors.surface },
  muteButton: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
    padding: 6,
  },

  actions: { flexDirection: 'row', gap: 18, paddingHorizontal: 12, paddingTop: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionCount: { color: Colors.cream, fontSize: 14, fontWeight: '600' },

  captionWrap: { paddingHorizontal: 12, paddingTop: 6 },
  caption: { color: Colors.cream, fontSize: 14, lineHeight: 19 },
  captionName: { fontWeight: '700' },
  viewComments: { color: Colors.muted, fontSize: 13, marginTop: 4 },

  fab: {
    position: 'absolute',
    bottom: 104,
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
  fabText: { color: Colors.black, fontSize: 34, fontWeight: '700', marginTop: -2 },
  refreshLogo: { alignItems: 'center', paddingVertical: 8 },
});