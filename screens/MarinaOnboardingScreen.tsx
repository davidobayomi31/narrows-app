import { useState, useEffect } from 'react';
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
import DismissKeyboardView from './components/DismissKeyboardView';

// Matches marina_applications_services_check in supabase/booking_expansion.sql —
// keep in sync if that list ever changes.
const SERVICE_OPTIONS: { key: string; label: string }[] = [
  { key: 'slip', label: 'Slip rental (seasonal)' },
  { key: 'day_slip', label: 'Day slip / transient dockage' },
  { key: 'winterization', label: 'Winterization' },
  { key: 'rental', label: 'Watercraft rental (seadoo, kayak, etc.)' },
  { key: 'storage', label: 'Land / covered storage' },
  { key: 'haul_out', label: 'Haul-out / lift service' },
];

// Marina signup. Submits a marina_applications row for YOU to review manually
// (see supabase/marina_winterization.sql) — no self-serve verification, since
// a false claim on an existing marina listing would be a real problem. The
// account still gets full app access immediately; only the Requests tab shows
// a "pending approval" state until you link + approve it.
//
// The services picked here become the marina's actual bookable listings the
// moment you approve (see the marinas_provision_from_application trigger in
// booking_expansion.sql) — a boater only ever sees a "Book X" button for a
// service this marina actually picked.
export default function MarinaOnboardingScreen() {
  const navigation = useNavigation<any>();
  const [marinaName, setMarinaName] = useState('');
  const [location, setLocation] = useState('');
  const [yearsInBusiness, setYearsInBusiness] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [services, setServices] = useState<string[]>([]);
  const [otherService, setOtherService] = useState('');
  const [numSlips, setNumSlips] = useState('');
  const [saving, setSaving] = useState(false);

  function toggleService(key: string) {
    setServices((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]));
  }

  // Apple only shares your name on the very first-ever Sign in with Apple for
  // this app; Google can also omit it. When that happens, ask for it here
  // instead of leaving the account permanently stuck showing "Boater".
  const [needsName, setNeedsName] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user?.user_metadata?.first_name) setNeedsName(true);
    });
  }, []);

  const canSubmit =
    marinaName.trim().length > 0 &&
    location.trim().length > 0 &&
    (services.length > 0 || otherService.trim().length > 0) &&
    (!needsName || firstName.trim().length > 0);

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
      first_name: needsName ? firstName.trim() : user.user_metadata.first_name,
      last_name: needsName ? lastName.trim() : (user.user_metadata.last_name ?? ''),
      account_type: 'marina',
    });

    const { error: applicationError } = await supabase.from('marina_applications').insert({
      user_id: user.id,
      marina_name: marinaName.trim(),
      location: location.trim(),
      years_in_business: yearsInBusiness.trim() ? Number(yearsInBusiness.trim()) : null,
      contact_phone: contactPhone.trim() || null,
      contact_email: contactEmail.trim() || null,
      services,
      other_service: otherService.trim() || null,
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
        <DismissKeyboardView>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Tell us about your marina</Text>
          <Text style={styles.subtitle}>
            We manually review every marina before it goes live — this usually takes a day or two.
          </Text>

          {needsName && (
            <>
              <Text style={styles.label}>Your name</Text>
              <TextInput
                style={styles.input}
                placeholder="First name"
                placeholderTextColor="#8899AA"
                value={firstName}
                onChangeText={setFirstName}
              />
              <TextInput
                style={styles.input}
                placeholder="Last name"
                placeholderTextColor="#8899AA"
                value={lastName}
                onChangeText={setLastName}
              />
            </>
          )}

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

          <Text style={styles.label}>What services do you offer?</Text>
          <Text style={styles.helperText}>
            Pick as many as apply — these become the actual booking options boaters see on your
            profile once you're approved.
          </Text>
          <View style={styles.chipRow}>
            {SERVICE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.chip, services.includes(opt.key) && styles.chipActive]}
                onPress={() => toggleService(opt.key)}
              >
                <Text style={[styles.chipText, services.includes(opt.key) && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Offer something else? (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. fuel dock, boat repair — we'll follow up"
            placeholderTextColor="#8899AA"
            value={otherService}
            onChangeText={setOtherService}
          />

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
        </DismissKeyboardView>
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
  helperText: { color: '#8899AA', fontSize: 12, marginBottom: 12, lineHeight: 16, marginTop: -4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333333',
  },
  chipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  chipText: { color: Colors.cream, fontSize: 13 },
  chipTextActive: { color: Colors.background, fontWeight: '700' },
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
