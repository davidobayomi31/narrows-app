import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';
import { friendlyError } from './errors';

// Lets the user pick a square photo, uploads it to storage, saves it as their
// profile avatar, and returns the new public URL (or null if cancelled/failed).
export async function pickAndSaveAvatar(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permission needed', 'Allow photo access to set a profile picture.');
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });
  if (result.canceled) return null;

  try {
    const uri = result.assets[0].uri;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const arraybuffer = await fetch(uri).then((r) => r.arrayBuffer());
    const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `avatars/${user.id}-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('post-images')
      .upload(path, arraybuffer, { contentType: `image/${ext}` });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from('post-images').getPublicUrl(path);

    const { error: updErr } = await supabase
      .from('profiles')
      .update({ avatar_url: pub.publicUrl })
      .eq('id', user.id);
    if (updErr) throw updErr;

    return pub.publicUrl;
  } catch (e: any) {
    Alert.alert('Upload failed', friendlyError(e));
    return null;
  }
}
