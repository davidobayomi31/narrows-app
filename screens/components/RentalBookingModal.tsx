import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, Alert, ActivityIndicator } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { Colors } from '../../constants/colors';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/errors';
import { formatDateYMD } from '../../lib/dateFormat';
import { sendPush } from '../../lib/sendPush';
import { pickAndUploadBookingDocument } from '../../lib/uploadBookingDocument';
import WizardModal from './WizardModal';

// Watercraft rental — the ONE instant-book flow in the app. Unlike every
// other wizard (which submits a request the marina reviews), this one:
//  1. checks live availability across all of the marina's rental units,
//  2. inserts the booking as 'approved' immediately (no human review — the
//     database's own exclusion constraint is what prevents double-booking,
//     by rejecting the INSERT outright if the slot's already taken),
//  3. takes payment in the SAME flow, right after.
// See supabase/rental_booking.sql for the hold-expiry mechanism that stops
// an abandoned reservation from squatting on a seadoo forever.

const MIN_AGE = 19; // matches the one real marina data point researched (Mariposa Landing)
const START_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const DURATIONS = [1, 2, 3, 4, 8]; // hours; 8 = "full day"
const STEP_TITLES = ['Time & Unit', 'Renter Info', 'Safety Rules', 'Review & Pay'];

type Listing = { id: string; name: string; price_cents: number | null };

type Props = {
  visible: boolean;
  marinaId: string;
  marinaProfileId: string | null;
  onClose: () => void;
  onSubmitted: () => void;
};

function calculateAge(dob: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

function formatHour(h: number): string {
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${period}`;
}

export default function RentalBookingModal({ visible, marinaId, marinaProfileId, onClose, onSubmitted }: Props) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [step, setStep] = useState(0);
  const [bookingId] = useState(() => crypto.randomUUID());

  const [listings, setListings] = useState<Listing[]>([]);

  // Step 0 — Time & Unit
  const [rentalDate, setRentalDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [startHour, setStartHour] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [availableListing, setAvailableListing] = useState<Listing | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  // Step 1 — Renter Info
  const [dob, setDob] = useState<Date | null>(null);
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licensePhotoPath, setLicensePhotoPath] = useState<string | null>(null);
  const [uploadingLicense, setUploadingLicense] = useState(false);

  // Step 2 — Safety Rules
  const [ackNoAlcohol, setAckNoAlcohol] = useState(false);
  const [ackNoShallow, setAckNoShallow] = useState(false);
  const [ackNoTowing, setAckNoTowing] = useState(false);
  const [ackDamage, setAckDamage] = useState(false);

  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    supabase
      .from('marina_listings')
      .select('id, name, price_cents')
      .eq('marina_id', marinaId)
      .eq('listing_type', 'rental')
      .eq('active', true)
      .then(({ data }) => setListings(data ?? []));
  }, [visible, marinaId]);

  // re-check availability any time the chosen slot changes
  useEffect(() => {
    setAvailableListing(null);
    setAvailabilityError(null);
    if (!rentalDate || startHour == null || duration == null || listings.length === 0) return;
    checkAvailability();
  }, [rentalDate, startHour, duration, listings]);

  function computeWindow(): { start: Date; end: Date } | null {
    if (!rentalDate || startHour == null || duration == null) return null;
    const start = new Date(rentalDate);
    start.setHours(startHour, 0, 0, 0);
    const end = new Date(start.getTime() + duration * 3600000);
    return { start, end };
  }

  async function checkAvailability() {
    const window = computeWindow();
    if (!window) return;
    setCheckingAvailability(true);

    // sweep abandoned unpaid holds first, so an expired reservation doesn't
    // falsely show a real seadoo as busy.
    await supabase.rpc('expire_stale_rental_holds', { p_marina_id: marinaId });

    const { data: busyRows } = await supabase
      .from('bookings')
      .select('listing_id')
      .in('listing_id', listings.map((l) => l.id))
      .in('status', ['approved', 'paid', 'completed'])
      .lt('start_ts', window.end.toISOString())
      .gt('end_ts', window.start.toISOString());

    const busyIds = new Set((busyRows ?? []).map((r) => r.listing_id));
    const free = listings.find((l) => !busyIds.has(l.id)) ?? null;

    setCheckingAvailability(false);
    setAvailableListing(free);
    if (!free) setAvailabilityError('No seadoos available for that time — try a different slot.');
  }

  const age = dob ? calculateAge(dob) : null;
  const step0Valid = availableListing != null && !checkingAvailability;
  const step1Valid = dob != null && age != null && age >= MIN_AGE && licenseNumber.trim().length > 0 && licensePhotoPath != null;
  const step2Valid = ackNoAlcohol && ackNoShallow && ackNoTowing && ackDamage;
  const step3Valid = emergencyContactName.trim().length > 0 && emergencyContactPhone.trim().length > 0;
  const stepValid = [step0Valid, step1Valid, step2Valid, step3Valid][step];

  const estimate = availableListing?.price_cents != null && duration != null
    ? (availableListing.price_cents * duration) / 100
    : null;

  function reset() {
    setStep(0);
    setListings([]);
    setRentalDate(null);
    setStartHour(null);
    setDuration(null);
    setAvailableListing(null);
    setAvailabilityError(null);
    setDob(null);
    setLicenseNumber('');
    setLicensePhotoPath(null);
    setAckNoAlcohol(false);
    setAckNoShallow(false);
    setAckNoTowing(false);
    setAckDamage(false);
    setEmergencyContactName('');
    setEmergencyContactPhone('');
    setNotes('');
  }

  function close() {
    reset();
    onClose();
  }

  function handleBack() {
    setStep(Math.max(0, step - 1));
  }

  function handleContinue() {
    if (!stepValid) return;
    if (step < STEP_TITLES.length - 1) {
      setStep(step + 1);
    } else {
      submit();
    }
  }

  async function handleUploadLicense() {
    setUploadingLicense(true);
    const path = await pickAndUploadBookingDocument(bookingId, 'drivers-license');
    setUploadingLicense(false);
    if (path) setLicensePhotoPath(path);
  }

  function onDateChange(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (event.type !== 'dismissed' && date) setRentalDate(date);
  }

  function onDobChange(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'android') setShowDobPicker(false);
    if (event.type !== 'dismissed' && date) setDob(date);
  }

  async function submit() {
    if (saving || !availableListing) return;
    const window = computeWindow();
    if (!window) return;
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    // Inserted straight to 'approved' — no marina review step for instant
    // book. The exclusion constraint (bookings_no_overlap_ts) is what
    // actually prevents a double-booking race: if someone else's booking for
    // this exact unit/window landed a moment earlier, THIS insert fails with
    // a Postgres exclusion_violation (code 23P01), caught below, before any
    // payment is attempted.
    const { error: insertError } = await supabase.from('bookings').insert({
      id: bookingId,
      listing_id: availableListing.id,
      user_id: user.id,
      status: 'approved',
      start_ts: window.start.toISOString(),
      end_ts: window.end.toISOString(),
      hold_expires_at: new Date(Date.now() + 10 * 60000).toISOString(),
      details: {
        dob: dob ? formatDateYMD(dob) : null,
        age,
        license_number: licenseNumber.trim(),
        license_document_path: licensePhotoPath,
        emergency_contact_name: emergencyContactName.trim(),
        emergency_contact_phone: emergencyContactPhone.trim(),
        safety_ack: { no_alcohol: true, no_shallow_water: true, no_towing: true, damage_responsibility: true },
      },
      boater_notes: notes.trim() || null,
      quoted_cents: estimate != null ? Math.round(estimate * 100) : null,
      // marina_id and exclusive are stamped server-side by a trigger.
    });

    if (insertError) {
      setSaving(false);
      if ((insertError as any).code === '23P01') {
        Alert.alert('Just missed it', 'That time slot was booked by someone else a moment ago — pick a different time.');
        setStep(0);
        checkAvailability();
      } else {
        Alert.alert('Could not book', friendlyError(insertError));
      }
      return;
    }

    // booking exists and holds the slot — now take payment.
    try {
      const { data, error } = await supabase.functions.invoke('create-payment-intent', {
        body: { booking_id: bookingId },
      });
      if (error || !data?.client_secret) throw new Error(error?.message || 'Could not start payment');

      const { error: sheetError } = await initPaymentSheet({
        merchantDisplayName: 'Narrows',
        paymentIntentClientSecret: data.client_secret,
        applePay: { merchantCountryCode: 'CA' },
      });
      if (sheetError) throw new Error(sheetError.message);

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code !== 'Canceled') Alert.alert('Payment failed', presentError.message);
        else {
          Alert.alert(
            'Reservation held',
            'Your seadoo is held for 10 minutes — reopen this booking from your requests to finish paying before it releases.'
          );
        }
        setSaving(false);
        onSubmitted(); // still refresh — the held booking should now show up with a Pay button
        return;
      }

      if (marinaProfileId) {
        await supabase.from('notifications').insert({
          recipient_id: marinaProfileId,
          actor_id: user.id,
          type: 'booking',
          comment_body: `Seadoo rental booked and paid — ${formatDateYMD(window.start)} ${formatHour(startHour!)}.`,
        });
        sendPush(marinaProfileId, 'New rental booked', 'A seadoo rental was just booked and paid.');
      }

      Alert.alert('Booked!', 'Your rental is confirmed and paid.');
      setSaving(false);
      reset();
      onSubmitted();
    } catch (err) {
      setSaving(false);
      Alert.alert(
        'Payment failed',
        `${(err as Error).message}\n\nYour reservation is still held for 10 minutes — try paying again from your requests.`
      );
      onSubmitted();
    }
  }

  return (
    <WizardModal
      visible={visible}
      onClose={close}
      title="Rent a Seadoo"
      stepTitles={STEP_TITLES}
      stepIndex={step}
      canContinue={stepValid}
      onBack={handleBack}
      onContinue={handleContinue}
      submitting={saving}
      submitLabel="Reserve & Pay"
    >
      {step === 0 && (
        <>
          {listings.length === 0 && <Text style={styles.empty}>This marina has no rental units listed right now.</Text>}

          <Text style={styles.label}>Date</Text>
          <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(true)}>
            <Text style={{ color: rentalDate ? Colors.cream : Colors.muted, fontSize: 15 }}>
              {rentalDate ? formatDateYMD(rentalDate) : 'Select a date'}
            </Text>
          </TouchableOpacity>
          {showDatePicker && (
            <View style={styles.datePickerWrap}>
              <DateTimePicker
                value={rentalDate ?? new Date()}
                mode="date"
                minimumDate={new Date()}
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={onDateChange}
                themeVariant="dark"
              />
              {Platform.OS === 'ios' && (
                <TouchableOpacity style={styles.datePickerDone} onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.datePickerDoneText}>Done</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <Text style={styles.label}>Start time</Text>
          <View style={styles.chipRow}>
            {START_HOURS.map((h) => (
              <TouchableOpacity key={h} style={[styles.chip, startHour === h && styles.chipActive]} onPress={() => setStartHour(h)}>
                <Text style={[styles.chipText, startHour === h && styles.chipTextActive]}>{formatHour(h)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Duration</Text>
          <View style={styles.chipRow}>
            {DURATIONS.map((d) => (
              <TouchableOpacity key={d} style={[styles.chip, duration === d && styles.chipActive]} onPress={() => setDuration(d)}>
                <Text style={[styles.chipText, duration === d && styles.chipTextActive]}>{d === 8 ? 'Full day' : `${d}h`}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {checkingAvailability && (
            <View style={styles.availabilityRow}>
              <ActivityIndicator color={Colors.gold} size="small" />
              <Text style={styles.availabilityText}>Checking availability…</Text>
            </View>
          )}
          {!checkingAvailability && availableListing && (
            <Text style={styles.availableText}>✓ {availableListing.name} is available</Text>
          )}
          {!checkingAvailability && availabilityError && <Text style={styles.errorText}>{availabilityError}</Text>}
        </>
      )}

      {step === 1 && (
        <>
          <Text style={styles.label}>Date of birth</Text>
          <TouchableOpacity style={styles.input} onPress={() => setShowDobPicker(true)}>
            <Text style={{ color: dob ? Colors.cream : Colors.muted, fontSize: 15 }}>{dob ? formatDateYMD(dob) : 'Select a date'}</Text>
          </TouchableOpacity>
          {showDobPicker && (
            <View style={styles.datePickerWrap}>
              <DateTimePicker
                value={dob ?? new Date(2000, 0, 1)}
                mode="date"
                maximumDate={new Date()}
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={onDobChange}
                themeVariant="dark"
              />
              {Platform.OS === 'ios' && (
                <TouchableOpacity style={styles.datePickerDone} onPress={() => setShowDobPicker(false)}>
                  <Text style={styles.datePickerDoneText}>Done</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {dob && age != null && age < MIN_AGE && (
            <Text style={styles.errorText}>Renters must be at least {MIN_AGE} years old.</Text>
          )}

          <Text style={styles.label}>Driver's license number</Text>
          <TextInput style={styles.input} placeholder="License #" placeholderTextColor={Colors.muted} value={licenseNumber} onChangeText={setLicenseNumber} />

          <Text style={styles.label}>Driver's license photo</Text>
          {licensePhotoPath ? (
            <Text style={styles.availableText}>✓ License attached</Text>
          ) : (
            <TouchableOpacity style={styles.verifyButton} onPress={handleUploadLicense} disabled={uploadingLicense}>
              <Text style={styles.verifyButtonText}>{uploadingLicense ? 'Uploading…' : 'Upload photo'}</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <AckRow checked={ackNoAlcohol} onPress={() => setAckNoAlcohol(!ackNoAlcohol)} text="I will not operate this watercraft under the influence of alcohol or drugs." />
          <AckRow checked={ackNoShallow} onPress={() => setAckNoShallow(!ackNoShallow)} text="I will not operate in water shallower than 3 feet." />
          <AckRow checked={ackNoTowing} onPress={() => setAckNoTowing(!ackNoTowing)} text="I will not use this watercraft for towing or beaching." />
          <AckRow checked={ackDamage} onPress={() => setAckDamage(!ackDamage)} text="I understand I am responsible for any damage to the watercraft during my rental." />
        </>
      )}

      {step === 3 && (
        <>
          <Text style={styles.label}>Emergency contact name</Text>
          <TextInput style={styles.input} placeholder="Who should the marina call if needed" placeholderTextColor={Colors.muted} value={emergencyContactName} onChangeText={setEmergencyContactName} />
          <Text style={styles.label}>Emergency contact phone</Text>
          <TextInput style={styles.input} placeholder="Phone number" placeholderTextColor={Colors.muted} keyboardType="phone-pad" value={emergencyContactPhone} onChangeText={setEmergencyContactPhone} />
          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput style={[styles.input, styles.notesInput]} placeholder="Anything else the marina should know" placeholderTextColor={Colors.muted} value={notes} onChangeText={setNotes} multiline />

          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Unit</Text>
            <Text style={styles.reviewValue}>{availableListing?.name}</Text>
          </View>
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>When</Text>
            <Text style={styles.reviewValue}>{rentalDate ? formatDateYMD(rentalDate) : ''} at {startHour != null ? formatHour(startHour) : ''} · {duration === 8 ? 'Full day' : `${duration}h`}</Text>
          </View>
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Renter</Text>
            <Text style={styles.reviewValue}>Age {age} — License {licenseNumber}</Text>
          </View>

          {estimate != null && (
            <View style={styles.estimateBox}>
              <Text style={styles.estimateLabel}>Total due now</Text>
              <Text style={styles.estimateValue}>${estimate.toFixed(0)}</Text>
              <Text style={styles.estimateNote}>Paid immediately — this reserves the seadoo, no marina approval needed.</Text>
            </View>
          )}
        </>
      )}
    </WizardModal>
  );
}

function AckRow({ checked, onPress, text }: { checked: boolean; onPress: () => void; text: string }) {
  return (
    <TouchableOpacity style={styles.ackRow} onPress={onPress}>
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={checked ? Colors.gold : Colors.muted} />
      <Text style={styles.ackText}>{text}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  label: { color: Colors.cream, fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  empty: { color: Colors.muted, fontSize: 13, marginBottom: 8 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: '#333333' },
  chipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  chipText: { color: Colors.cream, fontSize: 13 },
  chipTextActive: { color: Colors.black, fontWeight: '700' },

  input: { backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: Colors.cream, fontSize: 15 },
  notesInput: { minHeight: 70, textAlignVertical: 'top' },
  errorText: { color: '#FF6B6B', fontSize: 12, marginTop: 8, lineHeight: 16 },
  availableText: { color: '#4CAF50', fontSize: 13, marginTop: 8, fontWeight: '600' },

  availabilityRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  availabilityText: { color: Colors.muted, fontSize: 13 },

  verifyButton: { backgroundColor: Colors.surface, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4, borderWidth: 1, borderColor: '#333333' },
  verifyButtonText: { color: Colors.cream, fontSize: 13, fontWeight: '600' },

  datePickerWrap: { alignItems: 'center', marginTop: 8 },
  datePickerDone: { alignSelf: 'stretch', backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  datePickerDoneText: { color: Colors.black, fontWeight: '700', fontSize: 14 },

  ackRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2A2A2A' },
  ackText: { color: Colors.cream, fontSize: 14, flex: 1, lineHeight: 20 },

  reviewRow: { marginTop: 16 },
  reviewLabel: { color: Colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  reviewValue: { color: Colors.cream, fontSize: 15, marginTop: 3 },

  estimateBox: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginTop: 20, alignItems: 'center' },
  estimateLabel: { color: Colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  estimateValue: { color: Colors.gold, fontSize: 26, fontWeight: '800', marginTop: 4 },
  estimateNote: { color: Colors.muted, fontSize: 11, marginTop: 6, textAlign: 'center' },
});
