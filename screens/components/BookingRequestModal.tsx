import { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Alert,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/errors';
import { formatDateYMD } from '../../lib/dateFormat';
import { sendPush } from '../../lib/sendPush';
import { BOOKING_TYPES, ListingType, typeLabel } from '../../lib/bookingTypes';
import DismissKeyboardView from './DismissKeyboardView';

// Generalized request-flow booking modal for slip / mooring / storage.
// Winterization keeps its own dedicated modal (WinterizeRequestModal) — its
// boat-location/tow questions are unique enough that merging them here would
// just be one modal with two personalities. Rentals get the instant-book
// time-slot flow later (Phase A2), not this.

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
  marinaProfileId: string | null; // marinas.profile_id — who to notify
  listingType: ListingType;
  onClose: () => void;
  onSubmitted: () => void;
};

const BOAT_TYPES = ['Powerboat', 'Sailboat', 'Pontoon', 'Personal Watercraft', 'Other'];

function priceLabel(l: Listing): string | null {
  if (l.price_cents == null) return null;
  const dollars = (l.price_cents / 100).toFixed(0);
  const unit = l.price_unit && l.price_unit !== 'flat' ? `/${l.price_unit}` : '';
  return `$${dollars}${unit}`;
}

export default function BookingRequestModal({
  visible, marinaId, marinaProfileId, listingType, onClose, onSubmitted,
}: Props) {
  const insets = useSafeAreaInsets();
  const config = BOOKING_TYPES[listingType];

  const [listings, setListings] = useState<Listing[]>([]);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [boatType, setBoatType] = useState<string | null>(null);
  const [lengthFt, setLengthFt] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  // one picker component, aimed at whichever field was tapped
  const [pickerTarget, setPickerTarget] = useState<'start' | 'end' | null>(null);
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
        // only one unit of this type — nothing to choose, pick it for them
        setSelectedListing(rows.length === 1 ? rows[0] : null);
      });
  }, [visible, marinaId, listingType]);

  const parsedLength = parseFloat(lengthFt);
  const hasValidLength = lengthFt.trim().length > 0 && !Number.isNaN(parsedLength) && parsedLength > 0;

  // a boat longer than the unit's stated max can't request it
  const fitsListing =
    selectedListing == null ||
    selectedListing.max_length_ft == null ||
    !hasValidLength ||
    parsedLength <= Number(selectedListing.max_length_ft);

  const datesValid =
    startDate != null &&
    (!config.needsEndDate || (endDate != null && endDate.getTime() > startDate.getTime()));

  const canSubmit =
    selectedListing != null && boatType != null && hasValidLength && fitsListing && datesValid;

  // rough estimate from the listing's posted price — nights × nightly rate for
  // per-night/day units, or the flat/season price as-is. Marina still confirms.
  let estimate: number | null = null;
  if (selectedListing?.price_cents != null && datesValid && startDate) {
    const unit = selectedListing.price_unit;
    if ((unit === 'night' || unit === 'day') && endDate) {
      const nights = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));
      estimate = (selectedListing.price_cents * nights) / 100;
    } else if (unit === 'flat' || unit === 'season') {
      estimate = selectedListing.price_cents / 100;
    }
  }

  function reset() {
    setSelectedListing(null);
    setBoatType(null);
    setLengthFt('');
    setStartDate(null);
    setEndDate(null);
    setPickerTarget(null);
    setNotes('');
  }

  function close() {
    reset();
    onClose();
  }

  function onDateChange(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'android') setPickerTarget(null); // iOS stays open until "Done"
    if (event.type === 'dismissed' || !date) return;
    if (pickerTarget === 'start') {
      setStartDate(date);
      // departure before the new arrival makes no sense — clear it
      if (endDate && endDate.getTime() <= date.getTime()) setEndDate(null);
    } else if (pickerTarget === 'end') {
      setEndDate(date);
    }
  }

  async function submit() {
    if (!canSubmit || saving || !selectedListing || !startDate) return;
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const { error } = await supabase.from('bookings').insert({
      listing_id: selectedListing.id,
      user_id: user.id,
      boat_type: boatType,
      boat_length_ft: parsedLength,
      details: {},
      boater_notes: notes.trim() || null,
      start_date: formatDateYMD(startDate),
      end_date: endDate ? formatDateYMD(endDate) : null,
      quoted_cents: estimate != null ? Math.round(estimate * 100) : null,
      // marina_id and exclusive are stamped server-side by a trigger — never
      // set them from the client.
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

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable style={styles.spacer} onPress={close} />
        <KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.handle} />
          <DismissKeyboardView style={{ flex: 0 }}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 20 }]}
          >
            <Text style={styles.title}>{config.buttonText}</Text>
            <Text style={styles.subtitle}>
              Tell us about your boat and dates — the marina will confirm price and availability.
            </Text>

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
                          {[
                            l.max_length_ft != null ? `up to ${l.max_length_ft} ft` : null,
                            l.power,
                          ].filter(Boolean).join(' · ') || ' '}
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
            {!fitsListing && (
              <Text style={styles.fitError}>
                This {typeLabel(listingType).toLowerCase()} fits boats up to {selectedListing?.max_length_ft} ft.
              </Text>
            )}

            <Text style={styles.label}>{config.needsEndDate ? 'Arrival' : 'Date'}</Text>
            <TouchableOpacity style={styles.input} onPress={() => setPickerTarget('start')}>
              <Text style={{ color: startDate ? Colors.cream : Colors.muted, fontSize: 15 }}>
                {startDate ? formatDateYMD(startDate) : 'Select a date'}
              </Text>
            </TouchableOpacity>

            {config.needsEndDate && (
              <>
                <Text style={styles.label}>Departure</Text>
                <TouchableOpacity style={styles.input} onPress={() => setPickerTarget('end')}>
                  <Text style={{ color: endDate ? Colors.cream : Colors.muted, fontSize: 15 }}>
                    {endDate ? formatDateYMD(endDate) : 'Select a date'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {pickerTarget != null && (
              <View style={styles.datePickerWrap}>
                <DateTimePicker
                  value={(pickerTarget === 'start' ? startDate : endDate) ?? new Date()}
                  mode="date"
                  minimumDate={pickerTarget === 'end' && startDate ? new Date(startDate.getTime() + 86400000) : new Date()}
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  onChange={onDateChange}
                  themeVariant="dark"
                />
                {Platform.OS === 'ios' && (
                  <TouchableOpacity style={styles.datePickerDone} onPress={() => setPickerTarget(null)}>
                    <Text style={styles.datePickerDoneText}>Done</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <Text style={styles.label}>Notes (optional)</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              placeholder="Anything else the marina should know"
              placeholderTextColor={Colors.muted}
              value={notes}
              onChangeText={setNotes}
              multiline
            />

            {estimate != null && (
              <View style={styles.estimateBox}>
                <Text style={styles.estimateLabel}>Estimated price</Text>
                <Text style={styles.estimateValue}>${estimate.toFixed(0)}</Text>
                <Text style={styles.estimateNote}>
                  Based on the marina's posted rate — the marina confirms the final price.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.submitButton, (!canSubmit || saving) && styles.submitButtonDisabled]}
              onPress={submit}
              disabled={!canSubmit || saving}
            >
              <Text style={styles.submitButtonText}>{saving ? 'Sending…' : 'Send Request'}</Text>
            </TouchableOpacity>
          </ScrollView>
          </DismissKeyboardView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  spacer: { flex: 1 },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#3A3A3A', alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  title: { color: Colors.cream, fontSize: 20, fontWeight: '700', marginTop: 12, marginBottom: 4 },
  subtitle: { color: Colors.muted, fontSize: 13, marginBottom: 20, lineHeight: 18 },
  label: { color: Colors.cream, fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  empty: { color: Colors.muted, fontSize: 13, marginTop: 8 },

  listingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333333',
    padding: 14,
    marginBottom: 8,
  },
  listingRowActive: { borderColor: Colors.gold, backgroundColor: 'rgba(194,162,78,0.12)' },
  listingName: { color: Colors.cream, fontSize: 14, fontWeight: '600' },
  listingNameActive: { color: Colors.gold },
  listingMeta: { color: Colors.muted, fontSize: 12, marginTop: 2 },
  listingPrice: { color: Colors.cream, fontSize: 14, fontWeight: '700', marginLeft: 10 },

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
  fitError: { color: '#FF6B6B', fontSize: 12, marginTop: 8, lineHeight: 16 },

  datePickerWrap: { alignItems: 'center', marginTop: 8 },
  datePickerDone: { alignSelf: 'stretch', backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  datePickerDoneText: { color: Colors.black, fontWeight: '700', fontSize: 14 },

  estimateBox: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginTop: 24,
    alignItems: 'center',
  },
  estimateLabel: { color: Colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  estimateValue: { color: Colors.gold, fontSize: 26, fontWeight: '800', marginTop: 4 },
  estimateNote: { color: Colors.muted, fontSize: 11, marginTop: 6, textAlign: 'center' },

  submitButton: { backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  submitButtonDisabled: { opacity: 0.4 },
  submitButtonText: { color: Colors.black, fontSize: 16, fontWeight: '700' },
});
