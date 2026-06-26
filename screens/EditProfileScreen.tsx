import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';

export default function EditProfileScreen() {
  const navigation = useNavigation<any>();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [region, setRegion] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // load current profile into the form
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name, region, bio, avatar_url')
        .eq('id', user.id)
        .single();
      if (data) {
        setFirstName(data.first_name || '');
        setLastName(data.last_name || '');
        setRegion(data.region || '');
        setBio(data.bio || '');
        setAvatarUrl(data.avatar_url || null);
      }
    }
    load();
  }, []);

  async function pickAndUploadAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to set a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled) return;

    setUploading(true);
    try {
      const uri = result.assets[0].uri;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const arraybuffer = await fetch(uri).then((r) => r.arrayBuffer());
      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `avatars/${user.id}-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('post-images')
        .upload(path, arraybuffer, { contentType: `image/${ext}` });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from('post-images').getPublicUrl(path);
      setAvatarUrl(pub.publicUrl);
    } catch (e: any) {
      Alert.alert('Upload failed', friendlyError(e));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        region: region.trim() || null,
        bio: bio.trim() || null,
        avatar_url: avatarUrl || null,
      })
      .eq('id', user.id);
    setSaving(false);

    if (error) {
      Alert.alert('Could not save', friendlyError(error));
      return;
    }
    navigation.goBack();
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
    >
      {/* avatar */}
      <TouchableOpacity style={styles.avatarWrap} onPress={pickAndUploadAvatar}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitial}>{firstName?.[0]?.toUpperCase() || 'B'}</Text>
          </View>
        )}
        <Text style={styles.changePhoto}>{uploading ? 'Uploading…' : 'Change photo'}</Text>
      </TouchableOpacity>

      <Text style={styles.label}>First name</Text>
      <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholderTextColor={Colors.muted} />

      <Text style={styles.label}>Last name</Text>
      <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholderTextColor={Colors.muted} />

      <Text style={styles.label}>Region</Text>
      <TextInput style={styles.input} value={region} onChangeText={setRegion} placeholder="e.g. Simcoe County" placeholderTextColor={Colors.muted} />

      <Text style={styles.label}>Bio</Text>
      <TextInput
        style={[styles.input, styles.bio]}
        value={bio}
        onChangeText={setBio}
        placeholder="A little about you…"
        placeholderTextColor={Colors.muted}
        multiline
      />

      <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
        <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingBottom: 60 },
  avatarWrap: { alignItems: 'center', marginBottom: 24 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarPlaceholder: { backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: Colors.cream, fontSize: 36, fontWeight: 'bold' },
  changePhoto: { color: Colors.gold, fontSize: 14, fontWeight: '600', marginTop: 10 },
  label: { color: Colors.muted, fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 4 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.cream,
    fontSize: 15,
    marginBottom: 16,
  },
  bio: { minHeight: 90, textAlignVertical: 'top' },
  saveBtn: {
    backgroundColor: Colors.gold,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveText: { color: Colors.black, fontWeight: '700', fontSize: 16 },
});