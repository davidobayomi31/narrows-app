import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Image,
  Pressable,
  Alert,
} from 'react-native';
import { useState, useEffect } from 'react';
import { Colors } from '../../constants/colors';
import { supabase } from '../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { friendlyError } from '../../lib/errors';
import { containsBlockedWords } from '../../lib/moderation';

// cap uploads so a giant photo can't blow through storage/egress.
// Photos are already compressed at quality 0.7, so this only catches extremes.
const MAX_IMAGE_MB = 8;
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;

// videos are capped at 15s of capture (below) plus a hard byte cap as a backstop.
const MAX_VIDEO_SECONDS = 15;
const MAX_VIDEO_MB = 50;
const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;

const LOG_TYPES = ['Trip', 'Catch', 'Check-in'];
const CONDITIONS = ['GREAT', 'MIXED', 'ROUGH'];
const SPECIES = ['Bass', 'Pike', 'Walleye', 'Perch', 'Musky', 'Trout', 'Other'];

// composer label  ->  database code
const TYPE_MAP: Record<string, string> = {
  Trip: 'TRIP',
  Catch: 'CATCH',
  'Check-in': 'CHECK',
};

// database code  ->  composer label (reverse, used when editing)
const LABEL_MAP: Record<string, string> = {
  TRIP: 'Trip',
  CATCH: 'Catch',
  CHECK: 'Check-in',
};

const CONDITION_COLORS: Record<string, string> = {
  GREAT: '#166534',
  MIXED: '#92400E',
  ROUGH: '#7F1D1D',
};

type Props = {
  visible: boolean; // is the modal open?
  onClose: () => void; // call this to close it
  onSaved: () => void; // call this after a successful save (parent reloads)
  editingPost?: any; // if present → edit mode; if undefined → create mode
  tripPrefill?: { duration_hours: number; distance_km: number }; // pre-fill from a finished GPS trip
};

export default function PostComposer({ visible, onClose, onSaved, editingPost, tripPrefill }: Props) {
  const [activeLog, setActiveLog] = useState('Trip');
  const [activeCondition, setActiveCondition] = useState('GREAT');
  const [caption, setCaption] = useState('');
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [location, setLocation] = useState('');
  const [species, setSpecies] = useState('');
  const [weight, setWeight] = useState('');
  const [length, setLength] = useState('');
  const [released, setReleased] = useState(false);
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [viewImageUri, setViewImageUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // fill the form when editing, reset it when creating
  useEffect(() => {
    if (!visible) return;
    if (editingPost) {
      setActiveLog(LABEL_MAP[editingPost.type] ?? 'Trip');
      setActiveCondition(editingPost.conditions ?? 'GREAT');
      setCaption(editingPost.caption ?? '');
      setDuration(editingPost.duration_hours != null ? String(editingPost.duration_hours) : '');
      setDistance(editingPost.distance_km != null ? String(editingPost.distance_km) : '');
      setLocation(editingPost.location ?? '');
      setSpecies(editingPost.species ?? '');
      setWeight(editingPost.weight_lbs != null ? String(editingPost.weight_lbs) : '');
      setLength(editingPost.length_in != null ? String(editingPost.length_in) : '');
      setReleased(editingPost.released ?? false);
      if (editingPost.video_url) {
        setMediaUri(editingPost.video_url);
        setMediaType('video');
      } else {
        setMediaUri(editingPost.image_url ?? null);
        setMediaType('image');
      }
    } else {
      setActiveLog('Trip');
      setActiveCondition('GREAT');
      setCaption('');
      setDuration(tripPrefill ? String(tripPrefill.duration_hours) : '');
      setDistance(tripPrefill ? String(tripPrefill.distance_km) : '');
      setLocation('');
      setSpecies('');
      setWeight('');
      setLength('');
      setReleased(false);
      setMediaUri(null);
      setMediaType('image');
    }
  }, [visible, editingPost, tripPrefill]);

  function pickImage() {
    Alert.alert('Add Media', undefined, [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Record Video', onPress: recordVideo },
      { text: 'Choose from Library', onPress: pickFromLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permition needed.', 'Camera permission is needed to take a photo');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled && !isMediaTooLarge('image', result.assets[0].fileSize)) {
      setMediaUri(result.assets[0].uri);
      setMediaType('image');
    }
  }

  async function recordVideo() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permition needed.', 'Camera permission is needed to record a video');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: MAX_VIDEO_SECONDS,
      quality: 0.7,
    });
    if (!result.canceled && !isMediaTooLarge('video', result.assets[0].fileSize)) {
      setMediaUri(result.assets[0].uri);
      setMediaType('video');
    }
  }

  async function pickFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      videoMaxDuration: MAX_VIDEO_SECONDS,
      quality: 0.7,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const type = asset.type === 'video' ? 'video' : 'image';
    if (isMediaTooLarge(type, asset.fileSize)) return;
    setMediaUri(asset.uri);
    setMediaType(type);
  }

  // returns true (and warns) if the picked file is over the cap. fileSize may
  // be undefined on some platforms — uploadImage/uploadVideo has a hard backstop for that.
  function isMediaTooLarge(type: 'image' | 'video', fileSize?: number | null): boolean {
    const capBytes = type === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    const capMb = type === 'video' ? MAX_VIDEO_MB : MAX_IMAGE_MB;
    if (fileSize != null && fileSize > capBytes) {
      Alert.alert(type === 'video' ? 'Video too large' : 'Photo too large', `Please choose a ${type} under ${capMb} MB.`);
      return true;
    }
    return false;
  }

  async function uploadImage(uri: string) {
    const arraybuffer = await fetch(uri).then((res) => res.arrayBuffer());
    if (arraybuffer.byteLength > MAX_IMAGE_BYTES) {
      Alert.alert('Photo too large', `Please choose a photo under ${MAX_IMAGE_MB} MB.`);
      return null;
    }
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpeg';
    const path = `${Date.now()}.${ext}`;
    const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';

    const { error } = await supabase.storage
      .from('post-images')
      .upload(path, arraybuffer, { contentType });

    if (error) {
      Alert.alert('upload failed', friendlyError(error));
      return null;
    }
    const { data } = supabase.storage.from('post-images').getPublicUrl(path);
    return data.publicUrl;
  }

  async function uploadVideo(uri: string) {
    const arraybuffer = await fetch(uri).then((res) => res.arrayBuffer());
    if (arraybuffer.byteLength > MAX_VIDEO_BYTES) {
      Alert.alert('Video too large', `Please choose a video under ${MAX_VIDEO_MB} MB.`);
      return null;
    }
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'mp4';
    const path = `${Date.now()}.${ext}`;
    const contentType = ext === 'mov' ? 'video/quicktime' : 'video/mp4';

    const { error } = await supabase.storage
      .from('post-videos')
      .upload(path, arraybuffer, { contentType });

    if (error) {
      Alert.alert('upload failed', friendlyError(error));
      return null;
    }
    const { data } = supabase.storage.from('post-videos').getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSave() {
    if (saving) return; // guard against double-tap → double post

    // caption, hours and distance are all optional — users can post without them

    if (containsBlockedWords(caption)) {
      Alert.alert('Post not allowed', 'Your caption contains language that violates our community guidelines.');
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // keep an existing remote url, upload a new local file, or store nothing
      // — a post has either an image or a video, never both.
      let image_url: string | null = null;
      let video_url: string | null = null;
      if (mediaUri) {
        const isRemote = mediaUri.startsWith('http');
        if (mediaType === 'video') {
          video_url = isRemote ? mediaUri : await uploadVideo(mediaUri);
          if (video_url === null) {
            setSaving(false);
            return;
          }
        } else {
          image_url = isRemote ? mediaUri : await uploadImage(mediaUri);
          // upload failed or was rejected (too large) — stop, don't post a
          // media-less version of a post the user attached media to
          if (image_url === null) {
            setSaving(false);
            return;
          }

          // only re-check a freshly uploaded photo, not one already approved
          // on a previous save of this same post
          if (!isRemote) {
            const { data: modData, error: modError } = await supabase.functions.invoke('moderate-image', {
              body: { imageUrl: image_url },
            });
            if (modError) {
              Alert.alert('Could not check photo', friendlyError(modError));
              setSaving(false);
              return;
            }
            if (modData?.blocked) {
              const path = image_url.split('/post-images/')[1];
              if (path) await supabase.storage.from('post-images').remove([path]);
              Alert.alert('Post not allowed', 'This photo violates our community guidelines (nudity or graphic content).');
              setSaving(false);
              return;
            }
          }
        }
      }

      const fields = {
        type: TYPE_MAP[activeLog],
        conditions: activeLog === 'Trip' ? activeCondition : null,
        caption: caption.trim() || null,
        location: location || null,
        duration_hours: duration ? Number(duration) : null,
        distance_km: distance ? Number(distance) : null,
        species: species || null,
        weight_lbs: weight ? Number(weight) : null,
        length_in: length ? Number(length) : null,
        released: activeLog === 'Catch' ? released : null,
        image_url: image_url,
        video_url: video_url,
      };

      let error;
      if (editingPost) {
        // edit → update the existing row
        ({ error } = await supabase.from('posts').update(fields).eq('id', editingPost.id));
      } else {
        // create → insert a new row stamped with this user
        ({ error } = await supabase.from('posts').insert({ ...fields, user_id: user.id }));
      }

      if (error) {
        Alert.alert('Could not post', friendlyError(error));
      } else {
        onSaved();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.spacer} onPress={onClose} />
          <KeyboardAvoidingView
            style={styles.modalSheet}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
              <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editingPost ? 'Edit Post' : 'New Post'}</Text>
                <TouchableOpacity onPress={onClose}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.cardTitle}>What are you logging?</Text>
              <View style={styles.row}>
                {LOG_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.tab, activeLog === type && styles.tabActive]}
                    onPress={() => setActiveLog(type)}
                  >
                    <Text style={[styles.tabText, activeLog === type && styles.tabTextActive]}>
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Trip fields */}
              {activeLog === 'Trip' && (
                <>
                  <Text style={[styles.cardTitle, { marginTop: 16 }]}>How were the conditions?</Text>
                  <View style={styles.row}>
                    {CONDITIONS.map((cond) => (
                      <TouchableOpacity
                        key={cond}
                        style={[styles.tab, activeCondition === cond && { backgroundColor: CONDITION_COLORS[cond], borderColor: CONDITION_COLORS[cond] }]}
                        onPress={() => setActiveCondition(cond)}
                      >
                        <Text style={[styles.tabText, activeCondition === cond && { color: Colors.white }]}>{cond}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {tripPrefill && (
                    <Text style={styles.tripPrefillNote}>Auto-tracked from GPS — adjust if needed</Text>
                  )}
                  <TextInput style={styles.fieldInput} placeholder="Duration (hours)" placeholderTextColor={Colors.muted} keyboardType="numeric" value={duration} onChangeText={setDuration} />
                  <TextInput style={styles.fieldInput} placeholder="Distance (km)" placeholderTextColor={Colors.muted} keyboardType="numeric" value={distance} onChangeText={setDistance} />
                  <TextInput style={styles.fieldInput} placeholder="Where? (e.g. Narrows to Sparrow Lake)" placeholderTextColor={Colors.muted} value={location} onChangeText={setLocation} />
                </>
              )}

              {/* Catch fields */}
              {activeLog === 'Catch' && (
                <>
                  <Text style={[styles.cardTitle, { marginTop: 16 }]}>Species</Text>
                  <View style={styles.wrapRow}>
                    {SPECIES.map((s) => (
                      <TouchableOpacity
                        key={s}
                        style={[styles.pill, species === s && styles.tabActive]}
                        onPress={() => setSpecies(s)}
                      >
                        <Text style={[styles.tabText, species === s && styles.tabTextActive]}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Check-in fields */}
              {activeLog === 'Check-in' && (
                <TextInput style={[styles.fieldInput, { marginTop: 16 }]} placeholder="Where are you? (marina / location)" placeholderTextColor={Colors.muted} value={location} onChangeText={setLocation} />
              )}

              <TouchableOpacity style={styles.photoButton} onPress={pickImage}>
                <Text style={styles.photoButtonText}>
                  {mediaUri ? `Change ${mediaType === 'video' ? 'Video' : 'Photo'}` : '📷  Add Photo or Video'}
                </Text>
              </TouchableOpacity>
              {mediaUri && (
                <View style={styles.previewWrap}>
                  {mediaType === 'video' ? (
                    <ComposerVideoPreview uri={mediaUri} />
                  ) : (
                    <TouchableOpacity activeOpacity={0.9} onPress={() => setViewImageUri(mediaUri)}>
                      <Image source={{ uri: mediaUri }} style={styles.photoPreview} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.trashButton} onPress={() => setMediaUri(null)}>
                    <Image source={require('../../assets/trash.png')} style={styles.trashIconImage} />
                  </TouchableOpacity>
                </View>
              )}

              <TextInput
                style={styles.captionInput}
                placeholder="Say something about it..."
                placeholderTextColor={Colors.muted}
                value={caption}
                onChangeText={setCaption}
                multiline
              />

              <TouchableOpacity style={[styles.postButton, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                <Text style={styles.postButtonText}>
                  {saving ? 'Posting…' : editingPost ? 'Save Changes' : 'Post to Dock Feed'}
                </Text>
              </TouchableOpacity>
              </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Full-screen image viewer */}
      <Modal
        visible={!!viewImageUri}
        transparent
        animationType="fade"
        onRequestClose={() => setViewImageUri(null)}
      >
        <Pressable style={styles.imageViewerOverlay} onPress={() => setViewImageUri(null)}>
          {viewImageUri && (
            <Image source={{ uri: viewImageUri }} style={styles.fullImage} resizeMode="contain" />
          )}
        </Pressable>
      </Modal>
    </>
  );
}

// small preview player for a video attached in the composer — separate component
// so useVideoPlayer only mounts (and only runs) while a video is actually attached.
function ComposerVideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
  });
  return <VideoView player={player} style={styles.photoPreview} contentFit="cover" nativeControls />;
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  spacer: {
    flex: 1,
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: Colors.cream,
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalClose: {
    color: Colors.muted,
    fontSize: 20,
  },
  cardTitle: {
    color: Colors.cream,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  tripPrefillNote: {
    color: Colors.gold,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: Colors.gold,
  },
  tabText: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: Colors.black,
    fontWeight: '700',
  },
  fieldInput: {
    backgroundColor: Colors.surfaceAlt,
    color: Colors.cream,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    marginTop: 12,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surfaceAlt,
  },
  releaseToggle: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2E4057',
    alignItems: 'center',
  },
  photoButton: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
  },
  photoButtonText: {
    color: Colors.gold,
    fontSize: 14,
    fontWeight: '600',
  },
  previewWrap: {
    position: 'relative',
    marginTop: 12,
  },
  photoPreview: {
    width: '100%',
    height: 180,
    borderRadius: 12,
  },
  trashButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trashIcon: {
    fontSize: 16,
  },
  captionInput: {
    backgroundColor: Colors.surfaceAlt,
    color: Colors.cream,
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    minHeight: 60,
    marginTop: 16,
    marginBottom: 12,
  },
  postButton: {
    backgroundColor: Colors.gold,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  postButtonText: {
    color: Colors.black,
    fontSize: 15,
    fontWeight: '700',
  },
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullImage: {
    width: '100%',
    height: '80%',
  },
  trashIconImage: {
  width: 18,
  height: 18,
  tintColor: '#FFFFFF',
},
});
