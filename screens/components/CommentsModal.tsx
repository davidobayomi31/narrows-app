import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { Colors } from '../../constants/colors';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/errors';
import { containsBlockedWords } from '../../lib/moderation';
import { REPORT_REASONS, reportContent, getHiddenUserIds } from '../../lib/safety';

type Props = {
  visible: boolean;
  postId: string | null;
  postOwnerId?: string | null;
  onClose: () => void;
  onCommentAdded: () => void;
};

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function CommentsModal({ visible, postId, postOwnerId, onClose, onCommentAdded }: Props) {
  const [comments, setComments] = useState<any[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null); // id of the comment being edited
  const insets = useSafeAreaInsets(); // bottom inset so the input clears the home bar

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (visible && postId) {
      loadComments();
    }
    // leaving the sheet cancels any in-progress edit
    if (!visible) {
      setEditingId(null);
      setBody('');
    }
  }, [visible, postId]);

  async function loadComments() {
    const { data: commentsData } = await supabase
      .from('comments')
      .select('id, body, created_at, user_id')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, first_name, last_name');

    // hide comments from blocked users (either direction)
    const hidden = await getHiddenUserIds();

    const merged = (commentsData || [])
      .filter((c) => !hidden.has(c.user_id))
      .map((c) => ({
        ...c,
        author: profilesData?.find((p) => p.id === c.user_id),
      }));
    setComments(merged);
  }

  // long-press a comment: your own → Edit/Delete; someone else's → Report
  function commentMenu(comment: any) {
    if (comment.user_id === currentUserId) {
      Alert.alert('Your comment', undefined, [
        { text: 'Edit', onPress: () => startEdit(comment) },
        { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(comment) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      reportComment(comment);
    }
  }

  function startEdit(comment: any) {
    setEditingId(comment.id);
    setBody(comment.body);
  }

  function cancelEdit() {
    setEditingId(null);
    setBody('');
  }

  function confirmDelete(comment: any) {
    Alert.alert('Delete comment', 'This will permanently remove your comment.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('comments')
            .delete()
            .eq('id', comment.id)
            .eq('user_id', currentUserId);
          if (error) {
            Alert.alert('Could not delete', friendlyError(error));
            return;
          }
          if (editingId === comment.id) cancelEdit();
          loadComments();
          onCommentAdded(); // refresh the feed's comment count
        },
      },
    ]);
  }

  function reportComment(comment: any) {
    const buttons: any[] = REPORT_REASONS.map((reason) => ({
      text: reason,
      onPress: async () => {
        const ok = await reportContent({
          contentType: 'comment',
          contentId: comment.id,
          contentOwnerId: comment.user_id,
          reason,
        });
        Alert.alert(
          ok ? 'Thanks for reporting' : 'Could not report',
          ok ? 'Our team will review this comment within 24 hours.' : 'Please try again.'
        );
      },
    }));
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Report comment', 'Why are you reporting this?', buttons);
  }

  async function addComment() {
    if (body.trim().length === 0) return;

    if (containsBlockedWords(body)) {
      Alert.alert('Comment not allowed', 'Your comment contains language that violates our community guidelines.');
      return;
    }

    setSending(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSending(false);
      return;
    }

    const trimmedBody = body.trim();

    // edit mode: update the existing comment and stop (no new notification)
    if (editingId) {
      const { error: editError } = await supabase
        .from('comments')
        .update({ body: trimmedBody })
        .eq('id', editingId)
        .eq('user_id', user.id);
      setSending(false);
      if (editError) {
        Alert.alert('Could not update comment', friendlyError(editError));
        return;
      }
      setEditingId(null);
      setBody('');
      loadComments();
      onCommentAdded();
      return;
    }

    const { error } = await supabase.from('comments').insert({
      post_id: postId,
      user_id: user.id,
      body: trimmedBody,
    });

    if (!error && postOwnerId && postOwnerId !== user.id) {
      await supabase.from('notifications').insert({
        recipient_id: postOwnerId,
        actor_id: user.id,
        type: 'comment',
        post_id: postId,
        comment_body: trimmedBody.slice(0, 140),
      });
    }

    setSending(false);
    if (error) {
      Alert.alert('Could not post comment', friendlyError(error));
      return;
    }

    setBody('');
    loadComments();
    onCommentAdded();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* dim background; tap the empty top area to close */}
      <View style={styles.backdrop}>
        <Pressable style={styles.spacer} onPress={onClose} />

        {/* the sheet — only covers the lower part of the screen.
            insets.bottom can report 0 inside a Modal, so guarantee a minimum
            gap so the input/Send button always clears the home indicator */}
        <KeyboardAvoidingView
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) + 8 }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.headerTitle}>Comments</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={26} color="#8899AA" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {comments.length === 0 ? (
              <Text style={styles.empty}>No comments yet. Be the first.</Text>
            ) : (
              comments.map((c) => (
                <Pressable
                  key={c.id}
                  style={[styles.comment, editingId === c.id && styles.commentEditing]}
                  onLongPress={() => commentMenu(c)}
                  delayLongPress={400}
                >
                  <Text style={styles.commentName}>
                    {c.author?.first_name || 'Boater'} {c.author?.last_name || ''}
                  </Text>
                  <Text style={styles.commentBody}>{c.body}</Text>
                  <Text style={styles.commentTime}>{timeAgo(c.created_at)}</Text>
                </Pressable>
              ))
            )}
          </ScrollView>

          {editingId && (
            <View style={styles.editingBanner}>
              <Text style={styles.editingText}>Editing comment</Text>
              <TouchableOpacity onPress={cancelEdit} hitSlop={8}>
                <Text style={styles.editingCancel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder={editingId ? 'Edit your comment…' : 'Add a comment…'}
              placeholderTextColor="#8899AA"
              value={body}
              onChangeText={setBody}
              multiline
            />
            <TouchableOpacity style={styles.sendButton} onPress={addComment} disabled={sending}>
              <Text style={styles.sendText}>{sending ? '…' : editingId ? 'Update' : 'Send'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  spacer: { flex: 1 },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    borderTopWidth: 1,
    borderColor: '#1E1E1E',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3A3A',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  headerTitle: { color: Colors.cream, fontSize: 18, fontWeight: '700' },
  scroll: { flexShrink: 1 },
  list: { padding: 16, paddingBottom: 24 },
  empty: { color: '#8899AA', fontSize: 14, textAlign: 'center', marginTop: 32 },
  comment: {
    backgroundColor: '#0F0F0F',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1E1E1E',
  },
  commentEditing: { borderColor: Colors.gold },
  editingBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  editingText: { color: Colors.gold, fontSize: 13, fontWeight: '600' },
  editingCancel: { color: '#8899AA', fontSize: 13, fontWeight: '600' },
  commentName: { color: Colors.cream, fontSize: 14, fontWeight: '600', marginBottom: 4 },
  commentBody: { color: '#C9D3DD', fontSize: 14, lineHeight: 20 },
  commentTime: { color: '#8899AA', fontSize: 12, marginTop: 6 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1E1E1E',
  },
  input: {
    flex: 1,
    color: Colors.cream,
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxHeight: 100,
    fontSize: 14,
  },
  sendButton: {
    backgroundColor: Colors.gold,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendText: { color: Colors.black, fontWeight: '700', fontSize: 14 },
});