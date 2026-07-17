import { useState } from 'react';
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
import { Colors } from '../../constants/colors';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/errors';
import DismissKeyboardView from './DismissKeyboardView';

type Props = {
  visible: boolean;
  marinaId: string;
  marinaProfileId: string | null; // marinas.profile_id — who to notify
  onClose: () => void;
  onSubmitted: () => void;
};

const BOAT_TYPES = ['Powerboat', 'Sailboat', 'Pontoon', 'Personal Watercraft', 'Other'];

// Very rough, Narrows-wide placeholder estimate — clearly labeled as such.
// The marina sets the real, final price when they approve the request.
function estimatePrice(lengthFt: number): number {
  const raw = 200 + lengthFt * 15;
  return Math.round(raw / 10) * 10;
}

export default function WinterizeRequestModal({ visible, marinaId, marinaProfileId, onClose, onSubmitted }: Props) {
  const [boatType, setBoatType] = useState<string | null>(null);
  const [lengthFt, setLengthFt] = useState('');
  const [alreadyAtMarina, setAlreadyAtMarina] = useState<boolean | null>(null);
  const [needsTow, setNeedsTow] = useState<boolean | null>(null);
  const [preferredDate, setPreferredDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const parsedLength = parseFloat(lengthFt);
  const hasValidLength = lengthFt.trim().length > 0 && !Number.isNaN(parsedLength) && parsedLength > 0;

  const canSubmit =
    boatType != null &&
    hasValidLength &&
    alreadyAtMarina != null &&
    (alreadyAtMarina === true || needsTow != null);

  function reset() {
    setBoatType(null);
    setLengthFt('');
    setAlreadyAtMarina(null);
    setNeedsTow(null);
    setPreferredDate('');
    setNotes('');
  }

  function close() {
    reset();
    onClose();
  }

  async function submit() {
    if (!canSubmit || saving) return;
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const boatLocation = alreadyAtMarina ? 'at_marina' : needsTow ? 'needs_tow' : 'needs_drop_off';
    const estimate = estimatePrice(parsedLength);

    const { error } = await supabase.from('winterization_requests').insert({
      marina_id: marinaId,
      user_id: user.id,
      boat_type: boatType,
      boat_length_ft: parsedLength,
      boat_location: boatLocation,
      logistics_notes: notes.trim() || null,
      preferred_date: preferredDate.trim() || null,
      estimated_price: estimate,
    });

    if (!error && marinaProfileId) {
      await supabase.from('notifications').insert({
        recipient_id: marinaProfileId,
        actor_id: user.id,
        type: 'winterization',
        comment_body: 'New winterization request — open Requests to review.',
      });
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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable style={styles.spacer} onPress={close} />
        <KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.handle} />
          <DismissKeyboardView style={{ flex: 0 }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Text style={styles.title}>Winterize My Boat</Text>
            <Text style={styles.subtitle}>
              Tell us about your boat — the marina will confirm the final price and date.
            </Text>

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

            <Text style={styles.label}>Preferred date (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.muted}
              value={preferredDate}
              onChangeText={setPreferredDate}
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

            {estimate != null && (
              <View style={styles.estimateBox}>
                <Text style={styles.estimateLabel}>Rough estimate</Text>
                <Text style={styles.estimateValue}>${estimate}</Text>
                <Text style={styles.estimateNote}>
                  Approximate only — the marina confirms the final price.
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
