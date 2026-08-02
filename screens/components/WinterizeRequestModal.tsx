import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Colors } from '../../constants/colors';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/errors';
import { formatDateYMD } from '../../lib/dateFormat';
import { verifyAddress, VerifiedAddress } from '../../lib/geocode';
import { sendPush } from '../../lib/sendPush';
import WizardModal from './WizardModal';

type Props = {
  visible: boolean;
  marinaId: string;
  marinaProfileId: string | null; // marinas.profile_id — who to notify
  onClose: () => void;
  onSubmitted: () => void;
};

const BOAT_TYPES = ['Powerboat', 'Sailboat', 'Pontoon', 'Personal Watercraft', 'Other'];
const ENGINE_TYPES = ['Inboard', 'Outboard', 'Sterndrive', 'None'];
const FUEL_TYPES = ['Gas', 'Diesel', 'Electric', 'None'];
const STEP_TITLES = ['Boat Info', 'Service Details', 'Schedule & Contact', 'Review'];

// Very rough, Narrows-wide placeholder estimate — clearly labeled as such.
// The marina sets the real, final price when they approve the request (this
// overwrites the same `quoted_cents` field the estimate is stored in).
function estimatePrice(lengthFt: number): number {
  const raw = 200 + lengthFt * 15;
  return Math.round(raw / 10) * 10;
}

export default function WinterizeRequestModal({ visible, marinaId, marinaProfileId, onClose, onSubmitted }: Props) {
  const [step, setStep] = useState(0);
  const [listingId, setListingId] = useState<string | null>(null);

  // Step 0 — Boat Info
  const [boatType, setBoatType] = useState<string | null>(null);
  const [lengthFt, setLengthFt] = useState('');
  const [beamFt, setBeamFt] = useState('');
  const [makeModel, setMakeModel] = useState('');
  const [year, setYear] = useState('');

  // Step 1 — Service Details
  const [engineType, setEngineType] = useState<string | null>(null);
  const [fuelType, setFuelType] = useState<string | null>(null);
  const [mastDown, setMastDown] = useState<boolean | null>(null);
  const [shrinkWrap, setShrinkWrap] = useState<boolean | null>(null);
  const [alreadyAtMarina, setAlreadyAtMarina] = useState<boolean | null>(null);
  const [needsTow, setNeedsTow] = useState<boolean | null>(null);
  const [towAddress, setTowAddress] = useState('');
  const [verifiedAddress, setVerifiedAddress] = useState<VerifiedAddress | null>(null);
  const [verifyingAddress, setVerifyingAddress] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  // Step 2 — Schedule & Contact
  const [preferredDate, setPreferredDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);

  // The marina's "Winterization" listing is auto-created (by a Supabase
  // trigger) whenever winterization_enabled flips on, so this should always
  // find a row — but we still handle "not found" below just in case.
  useEffect(() => {
    if (!visible) return;
    supabase
      .from('marina_listings')
      .select('id')
      .eq('marina_id', marinaId)
      .eq('listing_type', 'winterization')
      .maybeSingle()
      .then(({ data }) => setListingId(data?.id ?? null));
  }, [visible, marinaId]);

  const parsedLength = parseFloat(lengthFt);
  const hasValidLength = lengthFt.trim().length > 0 && !Number.isNaN(parsedLength) && parsedLength > 0;
  const parsedBeam = parseFloat(beamFt);
  const hasValidBeam = beamFt.trim().length > 0 && !Number.isNaN(parsedBeam) && parsedBeam > 0;
  const isSailboat = boatType === 'Sailboat';

  const step0Valid = boatType != null && hasValidLength && hasValidBeam;
  const step1Valid =
    engineType != null &&
    fuelType != null &&
    (!isSailboat || mastDown != null) &&
    shrinkWrap != null &&
    alreadyAtMarina != null &&
    (alreadyAtMarina === true || (needsTow === false || (needsTow === true && verifiedAddress != null)));
  const step2Valid = emergencyContactName.trim().length > 0 && emergencyContactPhone.trim().length > 0;
  const stepValid = [step0Valid, step1Valid, step2Valid, true][step];

  function reset() {
    setStep(0);
    setBoatType(null);
    setLengthFt('');
    setBeamFt('');
    setMakeModel('');
    setYear('');
    setEngineType(null);
    setFuelType(null);
    setMastDown(null);
    setShrinkWrap(null);
    setAlreadyAtMarina(null);
    setNeedsTow(null);
    setTowAddress('');
    setVerifiedAddress(null);
    setVerifyingAddress(false);
    setAddressError(null);
    setPreferredDate(null);
    setShowDatePicker(false);
    setEmergencyContactName('');
    setEmergencyContactPhone('');
    setNotes('');
  }

  function onTowAddressChange(text: string) {
    setTowAddress(text);
    // Any edit invalidates a prior verification — the confirmed lat/lng
    // belongs to the old text, not this one.
    setVerifiedAddress(null);
    setAddressError(null);
  }

  async function handleVerifyAddress() {
    if (verifyingAddress || !towAddress.trim()) return;
    setVerifyingAddress(true);
    setAddressError(null);
    const result = await verifyAddress(towAddress);
    setVerifyingAddress(false);
    if (!result) {
      setAddressError("Couldn't find that address — check the street number and try again.");
      return;
    }
    setVerifiedAddress(result);
  }

  function onDateChange(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'android') setShowDatePicker(false); // iOS stays open until "Done"
    if (event.type !== 'dismissed' && date) setPreferredDate(date);
  }

  function close() {
    reset();
    onClose();
  }

  function handleContinue() {
    if (!stepValid) return;
    if (step < STEP_TITLES.length - 1) {
      setStep(step + 1);
    } else {
      submit();
    }
  }

  function handleBack() {
    setStep(Math.max(0, step - 1));
  }

  async function submit() {
    if (saving) return;

    if (!listingId) {
      Alert.alert('Not available', 'This marina has not set up winterization booking yet.');
      return;
    }

    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const boatLocation = alreadyAtMarina ? 'at_marina' : needsTow ? 'needs_tow' : 'needs_drop_off';
    const estimate = estimatePrice(parsedLength);

    const { error } = await supabase.from('bookings').insert({
      listing_id: listingId,
      user_id: user.id,
      boat_type: boatType,
      boat_length_ft: parsedLength,
      details: {
        boat_location: boatLocation,
        make_model: makeModel.trim() || null,
        year: year.trim() ? Number(year.trim()) : null,
        beam_ft: parsedBeam,
        engine_type: engineType,
        fuel_type: fuelType,
        mast_down: isSailboat ? mastDown : null,
        shrink_wrap: shrinkWrap,
        emergency_contact_name: emergencyContactName.trim(),
        emergency_contact_phone: emergencyContactPhone.trim(),
        ...(boatLocation === 'needs_tow' && verifiedAddress
          ? {
              tow_address: verifiedAddress.formatted,
              tow_address_lat: verifiedAddress.latitude,
              tow_address_lng: verifiedAddress.longitude,
            }
          : {}),
      },
      boater_notes: notes.trim() || null,
      start_date: preferredDate ? formatDateYMD(preferredDate) : null,
      quoted_cents: Math.round(estimate * 100),
      // marina_id and exclusive are stamped server-side by a trigger — never
      // set them from the client.
    });

    if (!error && marinaProfileId) {
      await supabase.from('notifications').insert({
        recipient_id: marinaProfileId,
        actor_id: user.id,
        type: 'winterization',
        comment_body: 'New winterization request — open Requests to review.',
      });
      sendPush(marinaProfileId, 'New winterization request', 'Open Requests to review and set a price.');
    }

    setSaving(false);
    if (error) {
      Alert.alert('Could not submit', friendlyError(error));
      return;
    }

    Alert.alert('Request sent', 'The marina will review your request and confirm a price and date.');
    reset();
    onSubmitted();
  }

  const estimate = hasValidLength ? estimatePrice(parsedLength) : null;

  return (
    <WizardModal
      visible={visible}
      onClose={close}
      title="Winterize My Boat"
      stepTitles={STEP_TITLES}
      stepIndex={step}
      canContinue={stepValid}
      onBack={handleBack}
      onContinue={handleContinue}
      submitting={saving}
      submitLabel="Send Request"
    >
      {step === 0 && (
        <>
          <Text style={styles.label}>Boat type</Text>
          <View style={styles.chipRow}>
            {BOAT_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, boatType === t && styles.chipActive]}
                onPress={() => setBoatType(t)}
              >
                <Text style={[styles.chipText, boatType === t && styles.chipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Boat length (ft)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 24"
            placeholderTextColor={Colors.muted}
            keyboardType="decimal-pad"
            value={lengthFt}
            onChangeText={setLengthFt}
          />

          <Text style={styles.label}>Beam / width (ft)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 8.5"
            placeholderTextColor={Colors.muted}
            keyboardType="decimal-pad"
            value={beamFt}
            onChangeText={setBeamFt}
          />

          <Text style={styles.label}>Make & model (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Sea Ray 240"
            placeholderTextColor={Colors.muted}
            value={makeModel}
            onChangeText={setMakeModel}
          />

          <Text style={styles.label}>Year (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 2018"
            placeholderTextColor={Colors.muted}
            keyboardType="number-pad"
            value={year}
            onChangeText={setYear}
          />
        </>
      )}

      {step === 1 && (
        <>
          <Text style={styles.label}>Engine type</Text>
          <View style={styles.chipRow}>
            {ENGINE_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, engineType === t && styles.chipActive]}
                onPress={() => setEngineType(t)}
              >
                <Text style={[styles.chipText, engineType === t && styles.chipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Fuel type</Text>
          <View style={styles.chipRow}>
            {FUEL_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, fuelType === t && styles.chipActive]}
                onPress={() => setFuelType(t)}
              >
                <Text style={[styles.chipText, fuelType === t && styles.chipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {isSailboat && (
            <>
              <Text style={styles.label}>Will the mast need to come down?</Text>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, mastDown === true && styles.chipActive]}
                  onPress={() => setMastDown(true)}
                >
                  <Text style={[styles.chipText, mastDown === true && styles.chipTextActive]}>Yes</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chip, mastDown === false && styles.chipActive]}
                  onPress={() => setMastDown(false)}
                >
                  <Text style={[styles.chipText, mastDown === false && styles.chipTextActive]}>No</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <Text style={styles.label}>Want shrink-wrap?</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity
              style={[styles.chip, shrinkWrap === true && styles.chipActive]}
              onPress={() => setShrinkWrap(true)}
            >
              <Text style={[styles.chipText, shrinkWrap === true && styles.chipTextActive]}>Yes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chip, shrinkWrap === false && styles.chipActive]}
              onPress={() => setShrinkWrap(false)}
            >
              <Text style={[styles.chipText, shrinkWrap === false && styles.chipTextActive]}>No</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Is your boat already at this marina?</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity
              style={[styles.chip, alreadyAtMarina === true && styles.chipActive]}
              onPress={() => { setAlreadyAtMarina(true); setNeedsTow(null); }}
            >
              <Text style={[styles.chipText, alreadyAtMarina === true && styles.chipTextActive]}>Yes, it's here</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chip, alreadyAtMarina === false && styles.chipActive]}
              onPress={() => setAlreadyAtMarina(false)}
            >
              <Text style={[styles.chipText, alreadyAtMarina === false && styles.chipTextActive]}>No</Text>
            </TouchableOpacity>
          </View>

          {alreadyAtMarina === false && (
            <>
              <Text style={styles.label}>How will it get there?</Text>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, needsTow === false && styles.chipActive]}
                  onPress={() => setNeedsTow(false)}
                >
                  <Text style={[styles.chipText, needsTow === false && styles.chipTextActive]}>I'll bring it myself</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chip, needsTow === true && styles.chipActive]}
                  onPress={() => setNeedsTow(true)}
                >
                  <Text style={[styles.chipText, needsTow === true && styles.chipTextActive]}>I need a tow</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {needsTow === true && (
            <>
              <Text style={styles.label}>Pickup address</Text>
              <TextInput
                style={styles.input}
                placeholder="Street address, city"
                placeholderTextColor={Colors.muted}
                value={towAddress}
                onChangeText={onTowAddressChange}
                onSubmitEditing={handleVerifyAddress}
              />
              {verifiedAddress ? (
                <Text style={styles.addressVerified}>✓ {verifiedAddress.formatted}</Text>
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.verifyButton, (!towAddress.trim() || verifyingAddress) && styles.disabled]}
                    onPress={handleVerifyAddress}
                    disabled={!towAddress.trim() || verifyingAddress}
                  >
                    <Text style={styles.verifyButtonText}>{verifyingAddress ? 'Checking…' : 'Verify address'}</Text>
                  </TouchableOpacity>
                  {addressError && <Text style={styles.addressError}>{addressError}</Text>}
                </>
              )}
            </>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <Text style={styles.label}>Preferred date (optional)</Text>
          <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(true)}>
            <Text style={{ color: preferredDate ? Colors.cream : Colors.muted, fontSize: 15 }}>
              {preferredDate ? formatDateYMD(preferredDate) : 'Select a date'}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <View style={styles.datePickerWrap}>
              <DateTimePicker
                value={preferredDate ?? new Date()}
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

          <Text style={styles.label}>Emergency contact name</Text>
          <TextInput
            style={styles.input}
            placeholder="Who should the marina call if needed"
            placeholderTextColor={Colors.muted}
            value={emergencyContactName}
            onChangeText={setEmergencyContactName}
          />

          <Text style={styles.label}>Emergency contact phone</Text>
          <TextInput
            style={styles.input}
            placeholder="Phone number"
            placeholderTextColor={Colors.muted}
            keyboardType="phone-pad"
            value={emergencyContactPhone}
            onChangeText={setEmergencyContactPhone}
          />

          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            placeholder="Anything else the marina should know"
            placeholderTextColor={Colors.muted}
            value={notes}
            onChangeText={setNotes}
            multiline
          />
        </>
      )}

      {step === 3 && (
        <>
          <ReviewRow label="Boat" value={`${boatType} · ${lengthFt}ft × ${beamFt}ft`} />
          {(makeModel || year) && <ReviewRow label="Make/model/year" value={`${makeModel || '—'} ${year ? `(${year})` : ''}`} />}
          <ReviewRow label="Engine / fuel" value={`${engineType} / ${fuelType}`} />
          {isSailboat && <ReviewRow label="Mast down" value={mastDown ? 'Yes' : 'No'} />}
          <ReviewRow label="Shrink-wrap" value={shrinkWrap ? 'Yes' : 'No'} />
          <ReviewRow
            label="Location"
            value={alreadyAtMarina ? 'Already at this marina' : needsTow ? `Needs a tow — ${verifiedAddress?.formatted}` : 'Owner will drop off'}
          />
          <ReviewRow label="Preferred date" value={preferredDate ? formatDateYMD(preferredDate) : 'No preference'} />
          <ReviewRow label="Emergency contact" value={`${emergencyContactName} — ${emergencyContactPhone}`} />
          {notes.trim() && <ReviewRow label="Notes" value={notes.trim()} />}

          {estimate != null && (
            <View style={styles.estimateBox}>
              <Text style={styles.estimateLabel}>Rough estimate</Text>
              <Text style={styles.estimateValue}>${estimate}</Text>
              <Text style={styles.estimateNote}>
                Approximate only — the marina confirms the final price.
              </Text>
            </View>
          )}
        </>
      )}
    </WizardModal>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: Colors.cream, fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 8 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: '#333333',
  },
  chipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  chipText: { color: Colors.cream, fontSize: 13 },
  chipTextActive: { color: Colors.black, fontWeight: '700' },

  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.cream,
    fontSize: 15,
  },
  notesInput: { minHeight: 70, textAlignVertical: 'top' },

  verifyButton: { backgroundColor: Colors.surface, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: '#333333' },
  verifyButtonText: { color: Colors.cream, fontSize: 13, fontWeight: '600' },
  addressVerified: { color: '#4CAF50', fontSize: 12, marginTop: 8, lineHeight: 16 },
  addressError: { color: '#FF6B6B', fontSize: 12, marginTop: 8, lineHeight: 16 },
  disabled: { opacity: 0.4 },

  datePickerWrap: { alignItems: 'center', marginTop: 8 },
  datePickerDone: { alignSelf: 'stretch', backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  datePickerDoneText: { color: Colors.black, fontWeight: '700', fontSize: 14 },

  reviewRow: { marginBottom: 14 },
  reviewLabel: { color: Colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  reviewValue: { color: Colors.cream, fontSize: 15, marginTop: 3 },

  estimateBox: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
    alignItems: 'center',
  },
  estimateLabel: { color: Colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  estimateValue: { color: Colors.gold, fontSize: 26, fontWeight: '800', marginTop: 4 },
  estimateNote: { color: Colors.muted, fontSize: 11, marginTop: 6, textAlign: 'center' },
});
