import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { supabase } from '../lib/supabase';
import { useAccount } from '../contexts/AccountContext';
import ChatModal from './components/ChatModal';

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

type Thread = {
  boaterId: string;
  boaterName: string;
  lastBody: string;
  lastAt: string;
  unread: number;
};

export default function MarinaMessagesScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { marina } = useAccount();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openThread, setOpenThread] = useState<Thread | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (marina?.id) load();
    }, [marina?.id])
  );

  // a tapped "new message" notification passes which boater's thread to jump
  // straight into.
  useEffect(() => {
    const boaterId = route.params?.openBoaterId as string | undefined;
    if (!boaterId || threads.length === 0) return;
    const match = threads.find((t) => t.boaterId === boaterId);
    if (match) {
      setOpenThread(match);
      navigation.setParams({ openBoaterId: undefined, openBoaterNonce: undefined });
    }
  }, [route.params?.openBoaterNonce, threads]);

  async function load() {
    if (!marina?.id) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setMyUserId(user.id);

    // Small message volume expected (one marina, its own boaters) -- fetch
    // recent history and group client-side into per-boater threads rather
    // than a separate threads/summary table.
    const { data: msgs } = await supabase
      .from('messages')
      .select('boater_id, sender_id, body, created_at, read_at')
      .eq('marina_id', marina.id)
      .order('created_at', { ascending: false })
      .limit(500);

    const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name');

    const byBoater = new Map<string, Thread>();
    for (const m of msgs || []) {
      const existing = byBoater.get(m.boater_id);
      const unreadDelta = m.sender_id !== user.id && m.read_at == null ? 1 : 0;
      if (!existing) {
        const p = profiles?.find((pr) => pr.id === m.boater_id);
        byBoater.set(m.boater_id, {
          boaterId: m.boater_id,
          boaterName: `${p?.first_name || 'Boater'} ${p?.last_name || ''}`.trim(),
          lastBody: m.body,
          lastAt: m.created_at,
          unread: unreadDelta,
        });
      } else {
        existing.unread += unreadDelta;
      }
    }

    setThreads(Array.from(byBoater.values()).sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1)));
    setLoading(false);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={Colors.cream} />
        </TouchableOpacity>
        <Text style={styles.brand}>Messages</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.loadingRoot}>
          <ActivityIndicator color={Colors.gold} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {threads.length === 0 && <Text style={styles.empty}>No conversations yet.</Text>}
          {threads.map((t) => (
            <TouchableOpacity key={t.boaterId} style={styles.card} onPress={() => setOpenThread(t)}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardName}>{t.boaterName}</Text>
                {t.unread > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>{t.unread > 9 ? '9+' : t.unread}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cardPreview} numberOfLines={1}>{t.lastBody}</Text>
              <Text style={styles.cardTime}>{timeAgo(t.lastAt)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {openThread && marina?.id && myUserId && (
        <ChatModal
          visible={!!openThread}
          marinaId={marina.id}
          boaterId={openThread.boaterId}
          otherPartyUserId={openThread.boaterId}
          headerTitle={openThread.boaterName}
          onClose={() => { setOpenThread(null); load(); }}
          onRead={load}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  brand: { color: Colors.cream, fontSize: 18, fontWeight: '700' },

  loadingRoot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 100 },
  empty: { color: Colors.muted, fontSize: 14, textAlign: 'center', marginTop: 40 },

  card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardName: { color: Colors.cream, fontSize: 15, fontWeight: '700' },
  cardPreview: { color: Colors.muted, fontSize: 13, marginTop: 4 },
  cardTime: { color: Colors.muted, fontSize: 11, marginTop: 6 },

  unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  unreadBadgeText: { color: Colors.black, fontSize: 11, fontWeight: '700' },
});
