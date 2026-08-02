import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';
import { friendlyError } from './errors';

// Uploads a picked photo (insurance certificate, license, etc.) to the
// PRIVATE booking-documents bucket at {user_id}/{bookingId}/{filename} — see
// supabase/booking_expansion.sql for the bucket + RLS. Only the uploading
// boater and that booking's marina can ever read it back.
//
// bookingId must be generated client-side BEFORE the booking row exists (the
// wizard calls crypto.randomUUID() when it opens, then inserts the booking
// with that same id at submit time) — the storage path needs a booking id to
// scope access to, but the upload has to happen before the boater hits
// submit so they can see the file attached in the Review step.
//
// Returns the storage PATH (not a public URL — the bucket is private) to
// store in bookings.details, or null if cancelled/failed.
export async function pickAndUploadBookingDocument(bookingId: string, label: string): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permission needed', `Allow photo access to attach your ${label}.`);
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
  });
  if (result.canceled) return null;

  try {
    const uri = result.assets[0].uri;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const arraybuffer = await fetch(uri).then((r) => r.arrayBuffer());
    const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${user.id}/${bookingId}/${label}-${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from('booking-documents')
      .upload(path, arraybuffer, { contentType: `image/${ext}` });
    if (error) throw error;

    return path;
  } catch (e: any) {
    Alert.alert('Upload failed', friendlyError(e));
    return null;
  }
}
