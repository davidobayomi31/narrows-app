import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Colors } from '../../constants/colors';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/errors';
import { formatDateYMD } from '../../lib/dateFormat';
import { sendPush } from '../../lib/sendPush';
import { pickAndUploadBookingDocument } from '../../lib/uploadBookingDocument';
import { BOOKING_TYPES, ListingType, typeLabel } from '../../lib/bookingTypes';
import { randomUUID } from '../../lib/uuid';
import WizardModal from './WizardModal';

// Real multi-step wizards for slip / day_slip / storage / haul_out — replaces
// the old single-page "boat type + length + dates + notes" modal, which
// wasn't enough for anything involving real liability (a seasonal slip
// lease, a $15k+ rig on a lift). Winterization has its own dedicated modal;
// rental gets the instant-book time-slot flow (Phase A4), not this.

type Listing = {
  id: string;
  name: string;
  price_cents: number | null;
  price_unit: string | null;
  max_length_ft: number | null;
  power: string | null;
};

type Props = {
  visible: boolean;
  marinaId: string;
  marinaProfileId: string | null;
  listingType: ListingType;
  onClose: () => void;
  onSubmitted: () => void;
};

const BOAT_TYPES = ['Powerboat', 'Sailboat', 'Pontoon', 'Personal Watercraft', 'Other'];
const POWER_OPTIONS = ['30A', '50A', 'None'];
const HAUL_OUT_PURPOSES = ['Repair', 'Inspection', 'Bottom cleaning', 'Other'];

const STEP_TITLES: Record<ListingType, string[]> = {
  slip: ['Boat Info', 'Power & Needs', 'Insurance', 'Season Dates', 'Emergency Contact', 'Review'],
  day_slip: ['Boat Info', 'Dates & Power', 'Contact', 'Review'],
  storage: ['Boat Info', 'Storage Details', 'Emergency Contact', 'Review'],
  haul_out: ['Boat Info', 'Service Date', 'Emergency Contact', 'Review'],
  mooring: ['Boat Info', 'Dates', 'Contact', 'Review'],
  winterization: [],
  rental: [],
  fuel: [],
};

function priceLabel(l: Listing): string | null {
  if (l.price_cents == null) return null;
  const dollars = (l.price_cents / 100).toFixed(0);
  const unit = l.price_unit && l.price_unit !== 'flat' ? `/${l.price_unit}` : '';
  return `$${dollars}${unit}`;
}

export default function BookingRequestModal({
  visible, marinaId, marinaProfileId, listingType, onClose, onSubmitted,
}: Props) {
  const config = BOOKING_TYPES[listingType];
  const stepTitles = STEP_TITLES[listingType];
  const [step, setStep] = useState(0);

  // Pre-generated so document uploads (insurance) have somewhere to live
  // before the booking row exists — the same id is used as bookings.id at
  // submit time.
  const [bookingId] = useState(() => randomUUID());

  const [listings, setListings] = useState<Listing[]>([]);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);

  // Boat info (shared, not every field used by every type)
  const [boatType, setBoatType] = useState<string | null>(null);
  const [boatName, setBoatName] = useState('');
  const [lengthFt, setLengthFt] = useState('');
  const [beamFt, setBeamFt] = useState('');
  const [draftFt, setDraftFt] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');

  // Slip / day_slip
  const [powerRequirement, setPowerRequirement] = useState<string | null>(null);
  const [waterHookup, setWaterHookup] = useState<boolean | null>(null);

  // Slip insurance
  const [insurer, setInsurer] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [liabilityAmount, setLiabilityAmount] = useState('');
  const [policyExpiry, setPolicyExpiry] = useState<Date | null>(null);
  const [insurancePhotoPath, setInsurancePhotoPath] = useState<string | null>(null);
  const [uploadingInsurance, setUploadingInsurance] = useState(false);

  // Storage
  const [trailerYN, setTrailerYN] = useState<boolean | null>(null);
  const [shrinkWrapAddOn, setShrinkWrapAddOn] = useState<boolean | null>(null);

  // Haul-out
  const [approxWeight, setApproxWeight] = useState('');
  const [haulOutPurpose, setHaulOutPurpose] = useState<string | null>(null);

  // Dates — startDate/endDate for slip/day_slip/storage (range);
  // haul_out uses only startDate as its single service date.
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [datePicker, setDatePicker] = useState<'start' | 'end' | 'expiry' | null>(null);

  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    supabase
      .from('marina_listings')
      .select('id, name, price_cents, price_unit, max_length_ft, power')
      .eq('marina_id', marinaId)
      .eq('listing_type', listingType)
      .eq('active', true)
      .order('name')
      .then(({ data }) => {
        const rows = data ?? [];
        setListings(rows);
        setSelectedListing(rows.length === 1 ? rows[0] : null);
      });
  }, [visible, marinaId, listingType]);

  const parsedLength = parseFloat(lengthFt);
  const hasValidLength = lengthFt.trim().length > 0 && !Number.isNaN(parsedLength) && parsedLength > 0;
  const parsedBeam = parseFloat(beamFt);
  const hasValidBeam = beamFt.trim().length > 0 && !Number.isNaN(parsedBeam) && parsedBeam > 0;
  const parsedDraft = parseFloat(draftFt);
  const hasValidDraft = draftFt.trim().length > 0 && !Number.isNaN(parsedDraft) && parsedDraft > 0;
  const parsedHeight = parseFloat(heightFt);
  const hasValidHeight = heightFt.trim().length > 0 && !Number.isNaN(parsedHeight) && parsedHeight > 0;
  const parsedWeight = parseFloat(approxWeight);
  const hasValidWeight = approxWeight.trim().length > 0 && !Number.isNaN(parsedWeight) && parsedWeight > 0;
  const parsedLiability = parseFloat(liabilityAmount);
  const hasValidLiability = liabilityAmount.trim().length > 0 && !Number.isNaN(parsedLiability) && parsedLiability > 0;

  const fitsListing =
    selectedListing == null ||
    selectedListing.max_length_ft == null ||
    !hasValidLength ||
    parsedLength <= Number(selectedListing.max_length_ft);

  const listingChosen = listings.length === 0 ? false : selectedListing != null;

  // per-type, per-step validity
  function boatInfoValid(): boolean {
    if (!listingChosen || !fitsListing) return false;
    switch (listingType) {
      case 'slip':
        return boatType != null && boatName.trim().length > 0 && hasValidLength && hasValidBeam &&
          hasValidDraft && hasValidHeight && registrationNumber.trim().length > 0;
      case 'day_slip':
        return boatType != null && hasValidLength && hasValidBeam && hasValidDraft;
      case 'storage':
        return boatType != null && hasValidLength && hasValidBeam && hasValidHeight && trailerYN != null;
      case 'haul_out':
        return boatType != null && hasValidLength && hasValidBeam && hasValidWeight;
      default:
        return false;
    }
  }

  const contactValid = emergencyContactName.trim().length > 0 && emergencyContactPhone.trim().length > 0;
  const datesRangeValid = startDate != null && endDate != null && endDate.getTime() > startDate.getTime();

  function stepValid(): boolean {
    if (listingType === 'slip') {
      switch (step) {
        case 0: return boatInfoValid();
        case 1: return powerRequirement != null && waterHookup != null;
        case 2: return insurer.trim().length > 0 && policyNumber.trim().length > 0 &&
          hasValidLiability && policyExpiry != null && insurancePhotoPath != null;
        case 3: return datesRangeValid;
        case 4: return contactValid;
        case 5: return true;
      }
    }
    if (listingType === 'day_slip') {
      switch (step) {
        case 0: return boatInfoValid();
        case 1: return datesRangeValid && powerRequirement != null;
        case 2: return contactValid;
        case 3: return true;
      }
    }
    if (listingType === 'storage') {
      switch (step) {
        case 0: return boatInfoValid();
        case 1: return startDate != null && endDate != null && endDate.getTime() > startDate.getTime() && shrinkWrapAddOn != null;
        case 2: return contactValid;
        case 3: return true;
      }
    }
    if (listingType === 'haul_out') {
      switch (step) {
        case 0: return boatInfoValid();
        case 1: return startDate != null && haulOutPurpose != null;
        case 2: return contactValid;
        case 3: return true;
      }
    }
    return false;
  }

  // rough estimate from the listing's posted price
  let estimate: number | null = null;
  if (selectedListing?.price_cents != null) {
    const unit = selectedListing.price_unit;
    if ((unit === 'night' || unit === 'day') && startDate && endDate) {
      const nights = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));
      estimate = (selectedListing.price_cents * nights) / 100;
    } else if (unit === 'flat' || unit === 'season') {
      estimate = selectedListing.price_cents / 100;
    }
  }

  function reset() {
    setStep(0);
    setListings([]);
    setSelectedListing(null);
    setBoatType(null);
    setBoatName('');
    setLengthFt('');
    setBeamFt('');
    setDraftFt('');
    setHeightFt('');
    setRegistrationNumber('');
    setPowerRequirement(null);
    setWaterHookup(null);
    setInsurer('');
    setPolicyNumber('');
    setLiabilityAmount('');
    setPolicyExpiry(null);
    setInsurancePhotoPath(null);
    setTrailerYN(null);
    setShrinkWrapAddOn(null);
    setApproxWeight('');
    setHaulOutPurpose(null);
    setStartDate(null);
    setEndDate(null);
    setDatePicker(null);
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
    if (!stepValid()) return;
    if (step < stepTitles.length - 1) {
      setStep(step + 1);
    } else {
      submit();
    }
  }

  async function handleUploadInsurance() {
    setUploadingInsurance(true);
    const path = await pickAndUploadBookingDocument(bookingId, 'insurance-certificate');
    setUploadingInsurance(false);
    if (path) setInsurancePhotoPath(path);
  }

  function onDateChange(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'android') setDatePicker(null);
    if (event.type === 'dismissed' || !date) return;
    if (datePicker === 'start') {
      setStartDate(date);
      if (endDate && endDate.getTime() <= date.getTime()) setEndDate(null);
    } else if (datePicker === 'end') {
      setEndDate(date);
    } else if (datePicker === 'expiry') {
      setPolicyExpiry(date);
    }
  }

  async function submit() {
    if (saving || !selectedListing) return;
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const details: Record<string, unknown> = {
      beam_ft: hasValidBeam ? parsedBeam : null,
      draft_ft: hasValidDraft ? parsedDraft : null,
      height_ft: hasValidHeight ? parsedHeight : null,
    };
    if (listingType === 'slip') {
      Object.assign(details, {
        boat_name: boatName.trim(),
        registration_number: registrationNumber.trim(),
        power_requirement: powerRequirement,
        water_hookup: waterHookup,
        insurer: insurer.trim(),
        policy_number: policyNumber.trim(),
        liability_amount: parsedLiability,
        policy_expiry: policyExpiry ? formatDateYMD(policyExpiry) : null,
        insurance_document_path: insurancePhotoPath,
      });
    } else if (listingType === 'day_slip') {
      Object.assign(details, { power_requirement: powerRequirement });
    } else if (listingType === 'storage') {
      Object.assign(details, { trailer: trailerYN, shrink_wrap: shrinkWrapAddOn });
    } else if (listingType === 'haul_out') {
      Object.assign(details, { approx_weight_lbs: parsedWeight, purpose: haulOutPurpose });
    }
    details.emergency_contact_name = emergencyContactName.trim();
    details.emergency_contact_phone = emergencyContactPhone.trim();

    const { error } = await supabase.from('bookings').insert({
      id: bookingId,
      listing_id: selectedListing.id,
      user_id: user.id,
      boat_type: boatType,
      boat_length_ft: parsedLength,
      details,
      boater_notes: notes.trim() || null,
      start_date: startDate ? formatDateYMD(startDate) : null,
      end_date: endDate ? formatDateYMD(endDate) : null,
      quoted_cents: estimate != null ? Math.round(estimate * 100) : null,
      // marina_id and exclusive are stamped server-side by a trigger.
    });

    if (!error && marinaProfileId) {
      const label = typeLabel(listingType).toLowerCase();
      await supabase.from('notifications').insert({
        recipient_id: marinaProfileId,
        actor_id: user.id,
        type: 'booking',
        comment_body: `New ${label} request — open Requests to review.`,
      });
      sendPush(marinaProfileId, `New ${label} request`, 'Open Requests to review and confirm.');
    }

    setSaving(false);
    if (error) {
      Alert.alert('Could not submit', friendlyError(error));
      return;
    }

    Alert.alert('Request sent', 'The marina will review your request and confirm price and availability.');
    reset();
    onSubmitted();
  }

  const boatInfoBlock = (
    <>
      {listings.length === 0 && (
        <Text style={styles.empty}>This marina has no {typeLabel(listingType).toLowerCase()} listings right now.</Text>
      )}
      {listings.length > 1 && (
        <>
          <Text style={styles.label}>Which {typeLabel(listingType).toLowerCase()}?</Text>
          {listings.map((l) => {
            const active = selectedListing?.id === l.id;
            const price = priceLabel(l);
            return (
              <TouchableOpacity
                key={l.id}
                style={[styles.listingRow, active && styles.listingRowActive]}
                onPress={() => setSelectedListing(l)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.listingName, active && styles.listingNameActive]}>{l.name}</Text>
                  <Text style={styles.listingMeta}>
                    {[l.max_length_ft != null ? `up to ${l.max_length_ft} ft` : null, l.power].filter(Boolean).join(' · ') || ' '}
                  </Text>
                </View>
                {price && <Text style={[styles.listingPrice, active && styles.listingNameActive]}>{price}</Text>}
              </TouchableOpacity>
            );
          })}
        </>
      )}

      <Text style={styles.label}>Boat type</Text>
      <View style={styles.chipRow}>
        {BOAT_TYPES.map((t) => (
          <TouchableOpacity key={t} style={[styles.chip, boatType === t && styles.chipActive]} onPress={() => setBoatType(t)}>
            <Text style={[styles.chipText, boatType === t && styles.chipTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {listingType === 'slip' && (
        <>
          <Text style={styles.label}>Boat name</Text>
          <TextInput style={styles.input} placeholder="e.g. Second Wind" placeholderTextColor={Colors.muted} value={boatName} onChangeText={setBoatName} />
        </>
      )}

      <Text style={styles.label}>Length overall (ft)</Text>
      <TextInput style={styles.input} placeholder="e.g. 28" placeholderTextColor={Colors.muted} keyboardType="decimal-pad" value={lengthFt} onChangeText={setLengthFt} />
      {!fitsListing && (
        <Text style={styles.errorText}>This {typeLabel(listingType).toLowerCase()} fits boats up to {selectedListing?.max_length_ft} ft.</Text>
      )}

      <Text style={styles.label}>Beam / width (ft)</Text>
      <TextInput style={styles.input} placeholder="e.g. 9.5" placeholderTextColor={Colors.muted} keyboardType="decimal-pad" value={beamFt} onChangeText={setBeamFt} />

      {(listingType === 'slip' || listingType === 'day_slip') && (
        <>
          <Text style={styles.label}>Draft (ft)</Text>
          <TextInput style={styles.input} placeholder="e.g. 3.5" placeholderTextColor={Colors.muted} keyboardType="decimal-pad" value={draftFt} onChangeText={setDraftFt} />
        </>
      )}

      {(listingType === 'slip' || listingType === 'storage') && (
        <>
          <Text style={styles.label}>Height / air draft (ft)</Text>
          <TextInput style={styles.input} placeholder="e.g. 10" placeholderTextColor={Colors.muted} keyboardType="decimal-pad" value={heightFt} onChangeText={setHeightFt} />
        </>
      )}

      {listingType === 'slip' && (
        <>
          <Text style={styles.label}>Boat registration / hull ID number</Text>
          <TextInput style={styles.input} placeholder="e.g. ON1234AB" placeholderTextColor={Colors.muted} value={registrationNumber} onChangeText={setRegistrationNumber} />
        </>
      )}

      {listingType === 'storage' && (
        <>
          <Text style={styles.label}>On a trailer?</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity style={[styles.chip, trailerYN === true && styles.chipActive]} onPress={() => setTrailerYN(true)}>
              <Text style={[styles.chipText, trailerYN === true && styles.chipTextActive]}>Yes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.chip, trailerYN === false && styles.chipActive]} onPress={() => setTrailerYN(false)}>
              <Text style={[styles.chipText, trailerYN === false && styles.chipTextActive]}>No</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {listingType === 'haul_out' && (
        <>
          <Text style={styles.label}>Approximate weight (lbs)</Text>
          <TextInput style={styles.input} placeholder="e.g. 6000" placeholderTextColor={Colors.muted} keyboardType="number-pad" value={approxWeight} onChangeText={setApproxWeight} />
        </>
      )}
    </>
  );

  const contactBlock = (
    <>
      <Text style={styles.label}>Emergency contact name</Text>
      <TextInput style={styles.input} placeholder="Who should the marina call if needed" placeholderTextColor={Colors.muted} value={emergencyContactName} onChangeText={setEmergencyContactName} />
      <Text style={styles.label}>Emergency contact phone</Text>
      <TextInput style={styles.input} placeholder="Phone number" placeholderTextColor={Colors.muted} keyboardType="phone-pad" value={emergencyContactPhone} onChangeText={setEmergencyContactPhone} />
      <Text style={styles.label}>Notes (optional)</Text>
      <TextInput style={[styles.input, styles.notesInput]} placeholder="Anything else the marina should know" placeholderTextColor={Colors.muted} value={notes} onChangeText={setNotes} multiline />
    </>
  );

  const datePickerBlock = datePicker != null && (
    <View style={styles.datePickerWrap}>
      <DateTimePicker
        value={(datePicker === 'start' ? startDate : datePicker === 'end' ? endDate : policyExpiry) ?? new Date()}
        mode="date"
        minimumDate={datePicker === 'end' && startDate ? new Date(startDate.getTime() + 86400000) : new Date()}
        display={Platform.OS === 'ios' ? 'inline' : 'default'}
        onChange={onDateChange}
        themeVariant="dark"
      />
      {Platform.OS === 'ios' && (
        <TouchableOpacity style={styles.datePickerDone} onPress={() => setDatePicker(null)}>
          <Text style={styles.datePickerDoneText}>Done</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const reviewRows: { label: string; value: string }[] = [
    { label: 'Boat', value: `${boatType || '—'} · ${lengthFt}ft × ${beamFt}ft` },
  ];
  if (listingType === 'slip') {
    reviewRows.push(
      { label: 'Name / registration', value: `${boatName} — ${registrationNumber}` },
      { label: 'Power / water', value: `${powerRequirement} / ${waterHookup ? 'Yes' : 'No'}` },
      { label: 'Insurance', value: `${insurer} — ${policyNumber} ($${liabilityAmount})` },
    );
  }
  if (listingType === 'day_slip') {
    reviewRows.push({ label: 'Power', value: `${powerRequirement}` });
  }
  if (listingType === 'storage') {
    reviewRows.push({ label: 'Trailer / shrink-wrap', value: `${trailerYN ? 'Yes' : 'No'} / ${shrinkWrapAddOn ? 'Yes' : 'No'}` });
  }
  if (listingType === 'haul_out') {
    reviewRows.push({ label: 'Weight / purpose', value: `${approxWeight} lbs — ${haulOutPurpose}` });
  }
  if (startDate) {
    reviewRows.push({ label: listingType === 'haul_out' ? 'Service date' : 'Dates', value: `${formatDateYMD(startDate)}${endDate ? ` → ${formatDateYMD(endDate)}` : ''}` });
  }
  reviewRows.push({ label: 'Emergency contact', value: `${emergencyContactName} — ${emergencyContactPhone}` });
  if (notes.trim()) reviewRows.push({ label: 'Notes', value: notes.trim() });

  return (
    <WizardModal
      visible={visible}
      onClose={close}
      title={config.buttonText}
      stepTitles={stepTitles}
      stepIndex={step}
      canContinue={stepValid()}
      onBack={handleBack}
      onContinue={handleContinue}
      submitting={saving}
      submitLabel="Send Request"
    >
      {step === 0 && boatInfoBlock}

      {listingType === 'slip' && step === 1 && (
        <>
          <Text style={styles.label}>Power requirement</Text>
          <View style={styles.chipRow}>
            {POWER_OPTIONS.map((p) => (
              <TouchableOpacity key={p} style={[styles.chip, powerRequirement === p && styles.chipActive]} onPress={() => setPowerRequirement(p)}>
                <Text style={[styles.chipText, powerRequirement === p && styles.chipTextActive]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>Need a water hookup?</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity style={[styles.chip, waterHookup === true && styles.chipActive]} onPress={() => setWaterHookup(true)}>
              <Text style={[styles.chipText, waterHookup === true && styles.chipTextActive]}>Yes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.chip, waterHookup === false && styles.chipActive]} onPress={() => setWaterHookup(false)}>
              <Text style={[styles.chipText, waterHookup === false && styles.chipTextActive]}>No</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {listingType === 'slip' && step === 2 && (
        <>
          <Text style={styles.label}>Insurance company</Text>
          <TextInput style={styles.input} placeholder="e.g. Intact Insurance" placeholderTextColor={Colors.muted} value={insurer} onChangeText={setInsurer} />
          <Text style={styles.label}>Policy number</Text>
          <TextInput style={styles.input} placeholder="Policy #" placeholderTextColor={Colors.muted} value={policyNumber} onChangeText={setPolicyNumber} />
          <Text style={styles.label}>Liability coverage ($)</Text>
          <TextInput style={styles.input} placeholder="e.g. 1000000" placeholderTextColor={Colors.muted} keyboardType="number-pad" value={liabilityAmount} onChangeText={setLiabilityAmount} />
          <Text style={styles.label}>Policy expiry date</Text>
          <TouchableOpacity style={styles.input} onPress={() => setDatePicker('expiry')}>
            <Text style={{ color: policyExpiry ? Colors.cream : Colors.muted, fontSize: 15 }}>
              {policyExpiry ? formatDateYMD(policyExpiry) : 'Select a date'}
            </Text>
          </TouchableOpacity>
          {datePicker === 'expiry' && datePickerBlock}
          <Text style={styles.label}>Insurance certificate photo</Text>
          {insurancePhotoPath ? (
            <Text style={styles.addressVerified}>✓ Certificate attached</Text>
          ) : (
            <TouchableOpacity style={styles.verifyButton} onPress={handleUploadInsurance} disabled={uploadingInsurance}>
              <Text style={styles.verifyButtonText}>{uploadingInsurance ? 'Uploading…' : 'Upload photo'}</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {listingType === 'slip' && step === 3 && (
        <>
          <Text style={styles.label}>Season start</Text>
          <TouchableOpacity style={styles.input} onPress={() => setDatePicker('start')}>
            <Text style={{ color: startDate ? Colors.cream : Colors.muted, fontSize: 15 }}>{startDate ? formatDateYMD(startDate) : 'Select a date'}</Text>
          </TouchableOpacity>
          <Text style={styles.label}>Season end</Text>
          <TouchableOpacity style={styles.input} onPress={() => setDatePicker('end')}>
            <Text style={{ color: endDate ? Colors.cream : Colors.muted, fontSize: 15 }}>{endDate ? formatDateYMD(endDate) : 'Select a date'}</Text>
          </TouchableOpacity>
          {(datePicker === 'start' || datePicker === 'end') && datePickerBlock}
        </>
      )}

      {listingType === 'slip' && step === 4 && contactBlock}

      {listingType === 'day_slip' && step === 1 && (
        <>
          <Text style={styles.label}>Arrival</Text>
          <TouchableOpacity style={styles.input} onPress={() => setDatePicker('start')}>
            <Text style={{ color: startDate ? Colors.cream : Colors.muted, fontSize: 15 }}>{startDate ? formatDateYMD(startDate) : 'Select a date'}</Text>
          </TouchableOpacity>
          <Text style={styles.label}>Departure</Text>
          <TouchableOpacity style={styles.input} onPress={() => setDatePicker('end')}>
            <Text style={{ color: endDate ? Colors.cream : Colors.muted, fontSize: 15 }}>{endDate ? formatDateYMD(endDate) : 'Select a date'}</Text>
          </TouchableOpacity>
          {(datePicker === 'start' || datePicker === 'end') && datePickerBlock}
          <Text style={styles.label}>Power requirement</Text>
          <View style={styles.chipRow}>
            {POWER_OPTIONS.map((p) => (
              <TouchableOpacity key={p} style={[styles.chip, powerRequirement === p && styles.chipActive]} onPress={() => setPowerRequirement(p)}>
                <Text style={[styles.chipText, powerRequirement === p && styles.chipTextActive]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
      {listingType === 'day_slip' && step === 2 && contactBlock}

      {listingType === 'storage' && step === 1 && (
        <>
          <Text style={styles.label}>Storage start</Text>
          <TouchableOpacity style={styles.input} onPress={() => setDatePicker('start')}>
            <Text style={{ color: startDate ? Colors.cream : Colors.muted, fontSize: 15 }}>{startDate ? formatDateYMD(startDate) : 'Select a date'}</Text>
          </TouchableOpacity>
          <Text style={styles.label}>Storage end</Text>
          <TouchableOpacity style={styles.input} onPress={() => setDatePicker('end')}>
            <Text style={{ color: endDate ? Colors.cream : Colors.muted, fontSize: 15 }}>{endDate ? formatDateYMD(endDate) : 'Select a date'}</Text>
          </TouchableOpacity>
          {(datePicker === 'start' || datePicker === 'end') && datePickerBlock}
          <Text style={styles.label}>Add shrink-wrap?</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity style={[styles.chip, shrinkWrapAddOn === true && styles.chipActive]} onPress={() => setShrinkWrapAddOn(true)}>
              <Text style={[styles.chipText, shrinkWrapAddOn === true && styles.chipTextActive]}>Yes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.chip, shrinkWrapAddOn === false && styles.chipActive]} onPress={() => setShrinkWrapAddOn(false)}>
              <Text style={[styles.chipText, shrinkWrapAddOn === false && styles.chipTextActive]}>No</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
      {listingType === 'storage' && step === 2 && contactBlock}

      {listingType === 'haul_out' && step === 1 && (
        <>
          <Text style={styles.label}>Service date</Text>
          <TouchableOpacity style={styles.input} onPress={() => setDatePicker('start')}>
            <Text style={{ color: startDate ? Colors.cream : Colors.muted, fontSize: 15 }}>{startDate ? formatDateYMD(startDate) : 'Select a date'}</Text>
          </TouchableOpacity>
          {datePicker === 'start' && datePickerBlock}
          <Text style={styles.label}>Purpose</Text>
          <View style={styles.chipRow}>
            {HAUL_OUT_PURPOSES.map((p) => (
              <TouchableOpacity key={p} style={[styles.chip, haulOutPurpose === p && styles.chipActive]} onPress={() => setHaulOutPurpose(p)}>
                <Text style={[styles.chipText, haulOutPurpose === p && styles.chipTextActive]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
      {listingType === 'haul_out' && step === 2 && contactBlock}

      {step === stepTitles.length - 1 && (
        <>
          {reviewRows.map((r) => (
            <View key={r.label} style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>{r.label}</Text>
              <Text style={styles.reviewValue}>{r.value}</Text>
            </View>
          ))}
          {estimate != null && (
            <View style={styles.estimateBox}>
              <Text style={styles.estimateLabel}>Estimated price</Text>
              <Text style={styles.estimateValue}>${estimate.toFixed(0)}</Text>
              <Text style={styles.estimateNote}>Based on the marina's posted rate — the marina confirms the final price.</Text>
            </View>
          )}
        </>
      )}
    </WizardModal>
  );
}

const styles = StyleSheet.create({
  label: { color: Colors.cream, fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  empty: { color: Colors.muted, fontSize: 13, marginBottom: 8 },

  listingRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    borderRadius: 12, borderWidth: 1, borderColor: '#333333', padding: 14, marginBottom: 8,
  },
  listingRowActive: { borderColor: Colors.gold, backgroundColor: 'rgba(194,162,78,0.12)' },
  listingName: { color: Colors.cream, fontSize: 14, fontWeight: '600' },
  listingNameActive: { color: Colors.gold },
  listingMeta: { color: Colors.muted, fontSize: 12, marginTop: 2 },
  listingPrice: { color: Colors.cream, fontSize: 14, fontWeight: '700', marginLeft: 10 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: '#333333' },
  chipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  chipText: { color: Colors.cream, fontSize: 13 },
  chipTextActive: { color: Colors.black, fontWeight: '700' },

  input: { backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: Colors.cream, fontSize: 15 },
  notesInput: { minHeight: 70, textAlignVertical: 'top' },
  errorText: { color: '#FF6B6B', fontSize: 12, marginTop: 8, lineHeight: 16 },
  addressVerified: { color: '#4CAF50', fontSize: 13, marginTop: 4 },

  verifyButton: { backgroundColor: Colors.surface, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4, borderWidth: 1, borderColor: '#333333' },
  verifyButtonText: { color: Colors.cream, fontSize: 13, fontWeight: '600' },

  datePickerWrap: { alignItems: 'center', marginTop: 8 },
  datePickerDone: { alignSelf: 'stretch', backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  datePickerDoneText: { color: Colors.black, fontWeight: '700', fontSize: 14 },

  reviewRow: { marginBottom: 14 },
  reviewLabel: { color: Colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  reviewValue: { color: Colors.cream, fontSize: 15, marginTop: 3 },

  estimateBox: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginTop: 12, alignItems: 'center' },
  estimateLabel: { color: Colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  estimateValue: { color: Colors.gold, fontSize: 26, fontWeight: '800', marginTop: 4 },
  estimateNote: { color: Colors.muted, fontSize: 11, marginTop: 6, textAlign: 'center' },
});
