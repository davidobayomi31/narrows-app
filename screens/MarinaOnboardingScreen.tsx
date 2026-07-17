import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';

// 4-question marina signup. Submits a marina_applications row for YOU to review
// manually (see supabase/marina_winterization.sql) — no self-serve verification,
// since a false claim on an existing marina listing would be a real problem.
// The account still gets full app access immediately; only the Requests tab
// shows a "pending approval" state until you link + approve it.
export default function MarinaOnboardingScreen() {
  const navigation = useNavigation<any>();
  const [marinaName, setMarinaName] = useState('');
  const [location, setLocation] = useState('');
  const [yearsInBusiness, setYearsInBusiness] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [offersWinterizing, setOffersWinterizing] = useState<boolean | null>(null);
  const [numSlips, setNumSlips] = useState('');
  const [saving, setSaving] = useState(false);

  const canSubmit = marinaName.trim().length > 0 && location.trim().length > 0;

  async function submit() {
    if (!canSubmit || saving) return;
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: user.id,
      first_name: user.user_metadata.first_name,
      last_name: user.user_metadata.last_name,
      account_type: 'marina',
    });

    const { error: applicationError } = await supabase.from('marina_applications').insert({
      user_id: user.id,
      marina_name: marinaName.trim(),
      location: location.trim(),
      years_in_business: yearsInBusiness.trim() ? Number(yearsInBusiness.trim()) : null,
      contact_phone: contactPhone.trim() || null,
      contact_email: contactEmail.trim() || null,
      offers_winterizing: offersWinterizing,
      num_slips: numSlips.trim() ? Number(numSlips.trim()) : null,
    });

    setSaving(false);

    if (profileError || applicationError) {
      Alert.alert('Could not submit', friendlyError(profileError ?? applicationError));
      return;
    }

    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Tell us about your marina</Text>
          <Text style={styles.subtitle}>
            We manually review every marina before it goes live — this usually takes a day or two.
          </Text>

          <Text style={styles.label}>Marina name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Blue Beacon Marina"
            placeholderTextColor="#8899AA"
            value={marinaName}
            onChangeText={setMarinaName}
          />

          <Text style={styles.label}>Location</Text>
          <TextInput
            style={styles.input}
            placeholder="Address or nearest town"
            placeholderTextColor="#8899AA"
            value={location}
            onChangeText={setLocation}
          />

          <Text style={styles.label}>Years in business</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 12"
            placeholderTextColor="#8899AA"
            value={yearsInBusiness}
            onChangeText={setYearsInBusiness}
            keyboardType="number-pad"
          />

          <Text style={styles.label}>Contact phone & email</Text>
          <TextInput
            style={styles.input}
            placeholder="Phone — for us to verify your marina"
            placeholderTextColor="#8899AA"
            value={contactPhone}
            onChangeText={setContactPhone}
            keyboardType="phone-pad"
          />
          <TextInput
            style={styles.input}
            placeholder="Email — where we'll send updates"
            placeholderTextColor="#8899AA"
            value={contactEmail}
            onChangeText={setContactEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Do you currently offer boat winterizing?</Text>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleOption, offersWinterizing === true && styles.toggleOptionActive]}
              onPress={() => setOffersWinterizing(true)}
            >
              <Text style={[styles.toggleOptionText, offersWinterizing === true && styles.toggleOptionTextActive]}>
                Yes
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleOption, offersWinterizing === false && styles.toggleOptionActive]}
              onPress={() => setOffersWinterizing(false)}
            >
              <Text style={[styles.toggleOptionText, offersWinterizing === false && styles.toggleOptionTextActive]}>
                No
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Number of slips / boats</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 40"
            placeholderTextColor="#8899AA"
            value={numSlips}
            onChangeText={setNumSlips}
            keyboardType="number-pad"
          />

          <TouchableOpacity
            style={[styles.submitButton, (!canSubmit || saving) && styles.submitButtonDisabled]}
            onPress={submit}
            disabled={!canSubmit || saving}
          >
            <Text style={styles.submitButtonText}>{saving ? 'Submitting…' : 'Submit for Review'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  container: { paddingHorizontal: 24, paddingTop: 40, paddingBottom: 40 },
  title: { color: Colors.cream, fontSize: 26, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { color: '#8899AA', fontSize: 14, marginBottom: 28, lineHeight: 20 },
  label: { color: Colors.cream, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333333',
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: Colors.cream,
    fontSize: 15,
    marginBottom: 20,
  },
  toggleRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  toggleOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333333',
    backgroundColor: '#1A1A1A',
  },
  toggleOptionActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  toggleOptionText: { color: Colors.cream, fontSize: 15, fontWeight: '600' },
  toggleOptionTextActive: { color: Colors.background },
  submitButton: {
    backgroundColor: Colors.gold,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: { opacity: 0.4 },
  submitButtonText: { color: Colors.background, fontSize: 16, fontWeight: '700' },
});
