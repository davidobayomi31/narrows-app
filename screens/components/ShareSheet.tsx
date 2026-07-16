import {
  Modal,
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  ScrollView,
  Share,
  Linking,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRef, useState } from 'react';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import * as Clipboard from 'expo-clipboard';
import * as MediaLibrary from 'expo-media-library';
import { Colors } from '../../constants/colors';

// Instagram-style share sheet: a slide-up panel with a small post preview and a
// horizontal row of circular action icons. In-app "send to people" is omitted
// on purpose — Narrows has no direct messaging yet.

type Props = {
  visible: boolean;
  post: any | null;
  onClose: () => void;
};

// TODO: swap for a real per-post web link once narrows.site has post pages.
const POST_LINK = 'https://narrows.site';
const TAG = 'Shared via Narrows · narrows.site';

export default function ShareSheet({ visible, post, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<string | null>(null); // which action is working
  const [toast, setToast] = useState<string | null>(null);
  // cache the downloaded media uri so Save + Share don't download twice
  const localUri = useRef<string | null>(null);

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 1600);
  }

  // download the post's media once, reuse afterwards
  async function ensureLocalMedia(): Promise<string | null> {
    if (localUri.current) return localUri.current;
    const remoteUrl = post?.video_url ?? post?.image_url;
    if (!remoteUrl) return null;
    const ext = post?.video_url ? 'mp4' : 'jpg';
    const dest = new File(Paths.cache, `narrows-share-${Date.now()}.${ext}`);
    const file = await File.downloadFileAsync(remoteUrl, dest);
    localUri.current = file.uri;
    return file.uri;
  }

  const caption: string = post?.caption ?? '';
  const shareText = `${caption ? caption + '\n\n' : ''}${TAG}\n${POST_LINK}`;

  async function copyLink() {
    setBusy('copy');
    try {
      await Clipboard.setStringAsync(POST_LINK);
      flash('Link copied');
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!post?.image_url && !post?.video_url) {
      flash('Nothing to save');
      return;
    }
    setBusy('save');
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow photo access to save this post to your camera roll.');
        return;
      }
      const uri = await ensureLocalMedia();
      if (uri) {
        await MediaLibrary.saveToLibraryAsync(uri);
        flash('Saved to camera roll');
      }
    } catch {
      Alert.alert('Could not save', 'Something went wrong saving this post.');
    } finally {
      setBusy(null);
    }
  }

  async function openWhatsApp() {
    const url = `whatsapp://send?text=${encodeURIComponent(shareText)}`;
    const ok = await Linking.canOpenURL(url).catch(() => false);
    if (!ok) {
      Alert.alert('WhatsApp not installed', 'Install WhatsApp to share there directly.');
      return;
    }
    Linking.openURL(url);
    onClose();
  }

  async function openMessages() {
    // iOS: sms: with a body pre-fills the Messages composer
    const url = `sms:&body=${encodeURIComponent(shareText)}`;
    const ok = await Linking.canOpenURL(url).catch(() => false);
    if (!ok) {
      Alert.alert('Messages unavailable', 'This device can’t open Messages.');
      return;
    }
    Linking.openURL(url);
    onClose();
  }

  // the always-works catch-all: the OS share sheet (WhatsApp, Messages, IG,
  // AirDrop, Mail — whatever the user has). Attaches media when present.
  async function shareToOS() {
    setBusy('more');
    try {
      if (!post?.image_url && !post?.video_url) {
        await Share.share({ message: shareText });
      } else {
        const uri = await ensureLocalMedia();
        await Share.share(uri ? { url: uri, message: TAG } : { message: shareText });
      }
      onClose();
    } catch {
      // user cancelling the OS sheet also lands here — stay silent
    } finally {
      setBusy(null);
    }
  }

  const actions = [
    { key: 'copy', label: 'Copy link', icon: <Ionicons name="link" size={24} color={Colors.cream} />, onPress: copyLink },
    { key: 'save', label: 'Save', icon: <Ionicons name="download-outline" size={24} color={Colors.cream} />, onPress: save },
    { key: 'whatsapp', label: 'WhatsApp', icon: <MaterialCommunityIcons name="whatsapp" size={26} color="#FFFFFF" />, tint: '#25D366', onPress: openWhatsApp },
    { key: 'messages', label: 'Messages', icon: <MaterialCommunityIcons name="message-text" size={24} color="#FFFFFF" />, tint: '#34C759', onPress: openMessages },
    { key: 'more', label: 'Share to…', icon: <Ionicons name="ellipsis-horizontal" size={24} color={Colors.cream} />, onPress: shareToOS },
  ];

  const previewUri = post?.image_url || post?.video_url || null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.spacer} onPress={onClose} />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Share</Text>

          {/* small preview of what's being shared */}
          {post && (
            <View style={styles.preview}>
              {previewUri ? (
                <Image source={{ uri: previewUri }} style={styles.previewThumb} />
              ) : (
                <View style={[styles.previewThumb, styles.previewThumbFallback]}>
                  <Ionicons name="chatbubble-ellipses-outline" size={20} color={Colors.muted} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.previewName} numberOfLines={1}>
                  {post.author?.first_name || 'Boater'} {post.author?.last_name || ''}
                </Text>
                {caption ? (
                  <Text style={styles.previewCaption} numberOfLines={1}>{caption}</Text>
                ) : null}
              </View>
            </View>
          )}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
          >
            {actions.map((a) => (
              <Pressable key={a.key} style={styles.action} onPress={a.onPress} disabled={busy !== null}>
                <View style={[styles.iconCircle, a.tint ? { backgroundColor: a.tint } : null]}>
                  {busy === a.key ? <ActivityIndicator color={Colors.cream} /> : a.icon}
                </View>
                <Text style={styles.actionLabel}>{a.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {toast && (
            <View style={styles.toast}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.gold} />
              <Text style={styles.toastText}>{toast}</Text>
            </View>
          )}

          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  spacer: { flex: 1 },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#3A3A3C', alignSelf: 'center', marginBottom: 12 },
  title: { color: Colors.cream, fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 14 },

  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 14,
    padding: 10,
    marginBottom: 18,
  },
  previewThumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: Colors.background },
  previewThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  previewName: { color: Colors.cream, fontSize: 14, fontWeight: '600' },
  previewCaption: { color: Colors.muted, fontSize: 13, marginTop: 2 },

  row: { gap: 22, paddingHorizontal: 4, paddingBottom: 6 },
  action: { alignItems: 'center', width: 64 },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  actionLabel: { color: Colors.cream, fontSize: 12, textAlign: 'center' },

  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  toastText: { color: Colors.cream, fontSize: 13, fontWeight: '600' },

  cancel: { marginTop: 14, paddingVertical: 14, alignItems: 'center' },
  cancelText: { color: Colors.muted, fontSize: 15, fontWeight: '600' },
});
