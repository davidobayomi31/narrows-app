import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { supabase } from '../../lib/supabase';
import { sendPush } from '../../lib/sendPush';

type Props = {
  visible: boolean;
  marinaId: string;
  boaterId: string;
  // who to notify when I send a message -- the OTHER participant's auth user
  // id. The caller already knows this (marina profile_id on the boater side,
  // the boater's own id on the marina side), so it's passed in rather than
  // re-derived here.
  otherPartyUserId: string | null;
  headerTitle: string;
  onClose: () => void;
  // called after messages are marked read, so the caller can refresh its
  // unread badge.
  onRead?: () => void;
};

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ChatModal({ visible, marinaId, boaterId, otherPartyUserId, headerTitle, onClose, onRead }: Props) {
  const insets = useSafeAreaInsets();
  const [myId, setMyId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const loadAndMarkRead = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setMyId(user.id);

    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('marina_id', marinaId)
      .eq('boater_id', boaterId)
      .order('created_at', { ascending: true });
    setMessages(data || []);
    setLoading(false);

    const unreadIds = (data || [])
      .filter((m) => m.sender_id !== user.id && m.read_at == null)
      .map((m) => m.id);
    if (unreadIds.length > 0) {
      await supabase.from('messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds);
      onRead?.();
    }
  }, [marinaId, boaterId]);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    loadAndMarkRead();

    // Realtime only cleanly filters on one column server-side -- filter by
    // marina_id here and check boater_id client-side.
    const channel = supabase
      .channel(`messages-${marinaId}-${boaterId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `marina_id=eq.${marinaId}` },
        (payload) => {
          const row = payload.new as any;
          if (row.boater_id !== boaterId) return;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          if (row.sender_id !== myId) {
            supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('id', row.id).then(() => onRead?.());
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [visible, marinaId, boaterId, loadAndMarkRead]);

  async function send() {
    const body = draft.trim();
    if (!body || sending || !myId) return;
    setSending(true);
    setDraft('');

    const { data, error } = await supabase
      .from('messages')
      .insert({ marina_id: marinaId, boater_id: boaterId, sender_id: myId, body })
      .select()
      .single();
    setSending(false);

    if (error || !data) {
      setDraft(body); // put it back so nothing is lost
      return;
    }
    setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));

    if (otherPartyUserId) {
      await supabase.from('notifications').insert({
        recipient_id: otherPartyUserId,
        actor_id: myId,
        type: 'message',
        comment_body: body.length > 80 ? `${body.slice(0, 80)}…` : body,
      });
      sendPush(otherPartyUserId, headerTitle, body);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={Colors.cream} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{headerTitle}</Text>
          <View style={{ width: 26 }} />
        </View>

        {loading ? (
          <View style={styles.loadingRoot}>
            <ActivityIndicator color={Colors.gold} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={<Text style={styles.empty}>No messages yet — say hello.</Text>}
            renderItem={({ item }) => {
              const mine = item.sender_id === myId;
              return (
                <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.body}</Text>
                  </View>
                  <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>{timeAgo(item.created_at)}</Text>
                </View>
              );
            }}
          />
        )}

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top}>
          <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <TextInput
              style={styles.input}
              placeholder="Message…"
              placeholderTextColor={Colors.muted}
              value={draft}
              onChangeText={setDraft}
              multiline
            />
            <Pressable style={[styles.sendButton, (!draft.trim() || sending) && styles.sendButtonDisabled]} onPress={send} disabled={!draft.trim() || sending}>
              <Ionicons name="paper-plane" size={18} color={Colors.background} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
  },
  headerTitle: { color: Colors.cream, fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center', marginHorizontal: 8 },

  loadingRoot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, flexGrow: 1 },
  empty: { color: Colors.muted, fontSize: 13, textAlign: 'center', marginTop: 40 },

  bubbleRow: { alignItems: 'flex-start', marginBottom: 12 },
  bubbleRowMine: { alignItems: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleTheirs: { backgroundColor: Colors.surface, borderBottomLeftRadius: 4 },
  bubbleMine: { backgroundColor: Colors.gold, borderBottomRightRadius: 4 },
  bubbleText: { color: Colors.cream, fontSize: 14, lineHeight: 19 },
  bubbleTextMine: { color: Colors.black },
  bubbleTime: { color: Colors.muted, fontSize: 10, marginTop: 4, marginHorizontal: 4 },
  bubbleTimeMine: { alignSelf: 'flex-end' },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#222222',
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: Colors.cream,
    fontSize: 14,
    maxHeight: 100,
  },
  sendButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { opacity: 0.4 },
});
