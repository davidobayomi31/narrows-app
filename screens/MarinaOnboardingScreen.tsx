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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';
import { verifyAddress, VerifiedAddress } from '../lib/geocode';
import DismissKeyboardView from './components/DismissKeyboardView';

// Matches marina_applications_services_check in supabase/booking_expansion.sql —
// keep in sync if that list ever changes.
const SERVICE_OPTIONS: { key: string; label: string; description: string }[] = [
  {
    key: 'slip',
    label: 'Slip rental (seasonal)',
    description: 'Boaters reserve a slip for the whole season and pay you directly through the app.',
  },
  {
    key: 'day_slip',
    label: 'Day slip / transient dockage',
    description: 'Short-term docking for boaters passing through, booked and paid per visit.',
  },
  {
    key: 'winterization',
    label: 'Winterization',
    description: 'Boaters book to have their boat winterized before the season ends.',
  },
  {
    key: 'rental',
    label: 'Watercraft rental (seadoo, kayak, etc.)',
    description: 'Boaters instantly book and pay to rent your watercraft — no approval step needed.',
  },
  {
    key: 'storage',
    label: 'Land / covered storage',
    description: 'Boaters reserve storage space for their boat or trailer during the off-season.',
  },
  {
    key: 'haul_out',
    label: 'Haul-out / lift service',
    description: 'Boaters book a one-time haul-out or lift for their boat.',
  },
];

// Amenities are separate from SERVICE_OPTIONS above — services are bookable
// (a boater taps "Book" and pays), amenities are just facts shown on the
// marina's profile card (a boater can't "book" WiFi).
const AMENITY_OPTIONS: string[] = [
  'Fuel Dock',
  'WiFi',
  'Showers',
  'Restrooms',
  'Pump-Out Station',
  'Laundry',
  'Picnic Area',
  'Boat Ramp',
  'Ice',
  'Repair Shop',
  'Bait & Tackle',
  'Security / Gated',
];

const STEP_TITLES = ['About your marina', 'Contact info', 'Services offered', 'Amenities', 'Final details'];

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
//
// Split into steps (rather than one long scroll) so it's easier for a marina
// owner to stay oriented on a small screen — each step has its own
// validation, and the last step's Continue button becomes Submit.
export default function MarinaOnboardingScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [stepIndex, setStepIndex] = useState(0);
  const [marinaName, setMarinaName] = useState('');
  const [location, setLocation] = useState('');
  const [yearsInBusiness, setYearsInBusiness] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [services, setServices] = useState<string[]>([]);
  const [otherService, setOtherService] = useState('');
  const [amenities, setAmenities] = useState<string[]>([]);
  const [numSlips, setNumSlips] = useState('');
  const [saving, setSaving] = useState(false);

  // The Location field must resolve to a real, geocoded street address before
  // the marina can move on — a made-up or vague address (e.g. "800 West ridge
  // blvd" with no city) silently geocodes to the wrong place entirely when a
  // boater later taps "Get Directions", since Apple/Google Maps has no
  // country hint to disambiguate it. verifyAddress() is the same
  // Nominatim-backed check the winterization tow flow already uses.
  const [verifiedAddress, setVerifiedAddress] = useState<VerifiedAddress | null>(null);
  const [verifyingAddress, setVerifyingAddress] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  function toggleService(key: string) {
    setServices((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]));
  }

  function toggleAmenity(name: string) {
    setAmenities((prev) => (prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name]));
  }

  function onLocationChange(text: string) {
    setLocation(text);
    // any edit invalidates a prior verification — the confirmed lat/lng
    // belongs to the old text, not this one.
    setVerifiedAddress(null);
    setAddressError(null);
  }

  async function handleVerifyAddress() {
    if (verifyingAddress || !location.trim()) return;
    setVerifyingAddress(true);
    setAddressError(null);
    const result = await verifyAddress(location);
    setVerifyingAddress(false);
    if (!result) {
      setAddressError("Couldn't find that address — include the street number and city, then try again.");
      return;
    }
    setVerifiedAddress(result);
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

  const stepValid = [
    (!needsName || firstName.trim().length > 0) &&
      marinaName.trim().length > 0 &&
      verifiedAddress != null,
    true, // contact info is optional
    services.length > 0 || otherService.trim().length > 0,
    true, // amenities are optional
    true, // number of slips is optional
  ];
  const canContinue = stepValid[stepIndex];
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === STEP_TITLES.length - 1;

  function goNext() {
    if (!canContinue) return;
    if (isLastStep) {
      submit();
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  function goBack() {
    if (isFirstStep) {
      navigation.goBack();
    } else {
      setStepIndex((i) => i - 1);
    }
  }

  async function submit() {
    if (saving) return;
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
      location: verifiedAddress?.formatted ?? location.trim(),
      location_lat: verifiedAddress?.latitude ?? null,
      location_lng: verifiedAddress?.longitude ?? null,
      years_in_business: yearsInBusiness.trim() ? Number(yearsInBusiness.trim()) : null,
      contact_phone: contactPhone.trim() || null,
      contact_email: contactEmail.trim() || null,
      services,
      other_service: otherService.trim() || null,
      amenities,
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
        <View style={styles.header}>
          <Text style={styles.title}>Tell us about your marina</Text>
          <Text style={styles.stepLabel}>
            Step {stepIndex + 1} of {STEP_TITLES.length} — {STEP_TITLES[stepIndex]}
          </Text>
          <View style={styles.dotsRow}>
            {STEP_TITLES.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === stepIndex && styles.dotActive, i < stepIndex && styles.dotDone]}
              />
            ))}
          </View>
        </View>

        <DismissKeyboardView style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            {stepIndex === 0 && (
              <>
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
                <Text style={styles.helperText}>
                  Full street address — this is what boaters get routed to when they tap "Get Directions".
                </Text>
                <TextInput
                  style={[styles.input, { marginBottom: 8 }]}
                  placeholder="Street address, city"
                  placeholderTextColor="#8899AA"
                  value={location}
                  onChangeText={onLocationChange}
                  onSubmitEditing={handleVerifyAddress}
                />
                {verifiedAddress ? (
                  <Text style={styles.addressVerified}>✓ {verifiedAddress.formatted}</Text>
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.verifyButton, (!location.trim() || verifyingAddress) && styles.continueButtonDisabled]}
                      onPress={handleVerifyAddress}
                      disabled={!location.trim() || verifyingAddress}
                    >
                      <Text style={styles.verifyButtonText}>{verifyingAddress ? 'Checking…' : 'Verify address'}</Text>
                    </TouchableOpacity>
                    {addressError && <Text style={styles.addressError}>{addressError}</Text>}
                  </>
                )}

                <Text style={[styles.label, { marginTop: 20 }]}>Years in business</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 12"
                  placeholderTextColor="#8899AA"
                  value={yearsInBusiness}
                  onChangeText={setYearsInBusiness}
                  keyboardType="number-pad"
                />
              </>
            )}

            {stepIndex === 1 && (
              <>
                <Text style={styles.subtitle}>How should we reach you if we have questions during review?</Text>

                <Text style={styles.label}>Contact phone</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Phone — for us to verify your marina"
                  placeholderTextColor="#8899AA"
                  value={contactPhone}
                  onChangeText={setContactPhone}
                  keyboardType="phone-pad"
                />

                <Text style={styles.label}>Contact email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Email — where we'll send updates"
                  placeholderTextColor="#8899AA"
                  value={contactEmail}
                  onChangeText={setContactEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </>
            )}

            {stepIndex === 2 && (
              <>
                <Text style={styles.label}>What services do you offer?</Text>
                <Text style={styles.helperText}>
                  Pick as many as apply — these become the actual booking options boaters see on your
                  profile once you're approved. Tap a service to see what it means.
                </Text>
                <View style={styles.chipRow}>
                  {SERVICE_OPTIONS.map((opt) => {
                    const active = services.includes(opt.key);
                    return (
                      <View key={opt.key} style={active ? styles.chipGroupActive : undefined}>
                        <TouchableOpacity
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => toggleService(opt.key)}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                        </TouchableOpacity>
                        {active && <Text style={styles.chipDescription}>{opt.description}</Text>}
                      </View>
                    );
                  })}
                </View>

                <Text style={styles.label}>Offer something else? (optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. fuel dock, boat repair — we'll follow up"
                  placeholderTextColor="#8899AA"
                  value={otherService}
                  onChangeText={setOtherService}
                />
              </>
            )}

            {stepIndex === 3 && (
              <>
                <Text style={styles.label}>What amenities do you have?</Text>
                <Text style={styles.helperText}>
                  Optional — these show up as tags on your marina's profile card for boaters browsing
                  nearby marinas.
                </Text>
                <View style={styles.amenityRow}>
                  {AMENITY_OPTIONS.map((name) => {
                    const active = amenities.includes(name);
                    return (
                      <TouchableOpacity
                        key={name}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => toggleAmenity(name)}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {stepIndex === 4 && (
              <>
                <Text style={styles.subtitle}>Last thing — then we'll send this off for review.</Text>

                <Text style={styles.label}>Number of slips / boats</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 40"
                  placeholderTextColor="#8899AA"
                  value={numSlips}
                  onChangeText={setNumSlips}
                  keyboardType="number-pad"
                />
              </>
            )}
          </ScrollView>
        </DismissKeyboardView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity style={styles.backButton} onPress={goBack} disabled={saving}>
            <Ionicons name="chevron-back" size={18} color={Colors.cream} />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.continueButton, (!canContinue || saving) && styles.continueButtonDisabled]}
            onPress={goNext}
            disabled={!canContinue || saving}
          >
            {saving ? (
              <ActivityIndicator color={Colors.background} />
            ) : (
              <Text style={styles.continueButtonText}>{isLastStep ? 'Submit for Review' : 'Continue'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  container: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 },

  header: { paddingHorizontal: 24, paddingTop: 12 },
  title: { color: Colors.cream, fontSize: 24, fontWeight: 'bold', marginBottom: 6 },
  stepLabel: { color: Colors.gold, fontSize: 13, fontWeight: '600' },
  dotsRow: { flexDirection: 'row', gap: 6, marginTop: 10, marginBottom: 4 },
  dot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceAlt },
  dotActive: { backgroundColor: Colors.gold },
  dotDone: { backgroundColor: Colors.gold, opacity: 0.5 },

  subtitle: { color: '#8899AA', fontSize: 14, marginBottom: 24, lineHeight: 20 },
  label: { color: Colors.cream, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  helperText: { color: '#8899AA', fontSize: 12, marginBottom: 12, lineHeight: 16, marginTop: -4 },
  chipRow: { gap: 10, marginBottom: 20 },
  chipGroupActive: { gap: 6 },
  amenityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  chip: {
    alignSelf: 'flex-start',
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
  chipDescription: { color: '#8899AA', fontSize: 12, lineHeight: 16, paddingHorizontal: 4 },
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
  verifyButton: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333333',
  },
  verifyButtonText: { color: Colors.cream, fontSize: 13, fontWeight: '600' },
  addressVerified: { color: '#4CAF50', fontSize: 12, lineHeight: 16 },
  addressError: { color: '#FF6B6B', fontSize: 12, marginTop: 8, lineHeight: 16 },

  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2A2A2A',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: '#333333',
  },
  backButtonText: { color: Colors.cream, fontSize: 15, fontWeight: '600', marginLeft: 2 },
  continueButton: { flex: 1, backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  continueButtonDisabled: { opacity: 0.4 },
  continueButtonText: { color: Colors.background, fontSize: 16, fontWeight: '700' },
});
