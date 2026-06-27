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
import { friendlyError } from '../../lib/errors';
import { containsBlockedWords } from '../../lib/moderation';

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
  const [imageUri, setImageUri] = useState<string | null>(null);
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
      setImageUri(editingPost.image_url ?? null);
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
      setImageUri(null);
    }
  }, [visible, editingPost, tripPrefill]);

  function pickImage() {
    Alert.alert('Add Photo', undefined, [
      { text: 'Take Photo', onPress: takePhoto },
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
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  }

  async function pickFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  }

  async function uploadImage(uri: string) {
    const arraybuffer = await fetch(uri).then((res) => res.arrayBuffer());
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

  async function handleSave() {
    if (saving) return; // guard against double-tap → double post

    if (caption.trim().length === 0) {
      Alert.alert('Add a caption', 'Please write a caption before posting.');
      return;
    }

    if (containsBlockedWords(caption)) {
      Alert.alert('Post not allowed', 'Your caption contains language that violates our community guidelines.');
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // keep an existing remote url, upload a new local file, or store nothing
      let image_url: string | null = null;
      if (imageUri) {
        image_url = imageUri.startsWith('http') ? imageUri : await uploadImage(imageUri);
      }

      const fields = {
        type: TYPE_MAP[activeLog],
        conditions: activeLog === 'Trip' ? activeCondition : null,
        caption: caption,
        location: location || null,
        duration_hours: duration ? Number(duration) : null,
        distance_km: distance ? Number(distance) : null,
        species: species || null,
        weight_lbs: weight ? Number(weight) : null,
        length_in: length ? Number(length) : null,
        released: activeLog === 'Catch' ? released : null,
        image_url: image_url,
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
                <Text style={styles.photoButtonText}>{imageUri ? 'Change Photo' : '📷  Add Photo'}</Text>
              </TouchableOpacity>
              {imageUri && (
                <View style={styles.previewWrap}>
                  <TouchableOpacity activeOpacity={0.9} onPress={() => setViewImageUri(imageUri)}>
                    <Image source={{ uri: imageUri }} style={styles.photoPreview} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.trashButton} onPress={() => setImageUri(null)}>
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
