import { View, Text, StyleSheet, FlatList, TouchableOpacity, InteractionManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { supabase } from '../lib/supabase';

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function NotificationsScreen() {
  const navigation = useNavigation<any>();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  function openPost(item: any) {
    if (!item.post_id) return; // older notifications may predate post_id
    navigation.navigate('Main', {
      screen: 'Feed',
      params: { focusPostId: item.post_id, focusType: item.type, focusNonce: Date.now() },
    });
  }

  // Run the DB load + state update AFTER the push/pop animation finishes.
  // Updating state mid-transition can deadlock the native stack (whole-app
  // freeze) on the new architecture, especially on repeated navigation.
  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        loadAndMarkRead();
      });
      return () => task.cancel();
    }, [])
  );

  async function loadAndMarkRead() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: notifData } = await supabase
      .from('notifications')
      .select('id, type, comment_body, created_at, read, actor_id, post_id')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false });

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, first_name, last_name');

    const merged = (notifData || []).map((n) => ({
      ...n,
      actor: profilesData?.find((p) => p.id === n.actor_id),
    }));
    setNotifications(merged);
    setLoading(false);

    // mark everything unread as read now that the user has seen this screen
    const unreadIds = (notifData || []).filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length > 0) {
      await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* custom header — a JS back button avoids the native-stack header
          back button becoming unresponsive on repeat visits */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={Colors.cream} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.backBtn} />
      </View>
      <FlatList
        contentContainerStyle={styles.content}
        data={notifications}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>No notifications yet.</Text> : null
        }
        renderItem={({ item }) => {
          const name = `${item.actor?.first_name || 'Boater'} ${item.actor?.last_name || ''}`.trim();
          return (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => openPost(item)}
              disabled={!item.post_id}
            >
              <View style={styles.iconWrap}>
                {item.type === 'like' ? (
                  <MaterialCommunityIcons name="anchor" size={18} color={Colors.gold} />
                ) : (
                  <Ionicons name="chatbubble" size={16} color={Colors.gold} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.text}>
                  <Text style={styles.name}>{name}</Text>
                  {item.type === 'like' ? ' liked your post' : ' commented on your post'}
                  {item.type === 'comment' && item.comment_body ? `: "${item.comment_body}"` : ''}
                </Text>
                <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
              </View>
              {!item.read && <View style={styles.unreadDot} />}
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  headerTitle: { color: Colors.cream, fontSize: 18, fontWeight: '700' },
  content: { padding: 16 },
  empty: { color: Colors.muted, fontSize: 14, textAlign: 'center', marginTop: 60 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: Colors.cream, fontSize: 14, lineHeight: 19 },
  name: { fontWeight: '700' },
  time: { color: Colors.muted, fontSize: 12, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.gold },
});
