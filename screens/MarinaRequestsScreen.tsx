import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Colors } from '../constants/colors';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';
import { formatDateYMD, parseDateYMD } from '../lib/dateFormat';
import { sendPush } from '../lib/sendPush';
import { useAccount } from '../contexts/AccountContext';
import { typeLabel } from '../lib/bookingTypes';
import DismissKeyboardView from './components/DismissKeyboardView';

const FILTERS = ['All', 'Requested', 'Approved', 'In Progress', 'Completed', 'Declined'];
const FILTER_STATUS: Record<string, string> = {
  Requested: 'pending',
  Approved: 'approved',
  'In Progress': 'in_progress',
  Completed: 'completed',
  Declined: 'declined',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Requested',
  approved: 'Approved',
  in_progress: 'In Progress',
  paid: 'Paid',
  completed: 'Completed',
  declined: 'Declined',
  cancelled: 'Cancelled',
};
const STATUS_COLOR: Record<string, string> = {
  pending: '#92400E',
  approved: '#1B4FD8',
  in_progress: '#6B4E9E',
  paid: '#1B4FD8',
  completed: '#166534',
  declined: '#7F1D1D',
  cancelled: '#7F1D1D',
};

const LOCATION_LABEL: Record<string, string> = {
  at_marina: 'Already at this marina',
  needs_drop_off: 'Owner will drop off',
  needs_tow: 'Needs a tow',
};

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function MarinaRequestsScreen() {
  const navigation = useNavigation<any>();
  const { loading: accountLoading, marina } = useAccount();
  const [activeFilter, setActiveFilter] = useState('All');
  const [requests, setRequests] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [dateInput, setDateInput] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (marina?.id) {
        loadRequests();
        loadUnreadMessages();
      }
    }, [marina?.id])
  );

  async function loadUnreadMessages() {
    if (!marina?.id) return;
    // marina.profile_id (the marina row's owner column) isn't on the
    // OwnedMarina type -- but since accountType === 'marina' was resolved by
    // matching marinas.profile_id to this session's own user id, "my id" IS
    // that value.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('marina_id', marina.id)
      .neq('sender_id', user.id)
      .is('read_at', null);
    setUnreadMessages(count || 0);
  }

  async function loadRequests() {
    if (!marina?.id) return;
    // one inbox for every booking type — the joined listing_type labels each
    // card (winterization, slip, mooring, storage, …).
    const { data: reqData } = await supabase
      .from('bookings')
      .select('*, marina_listings!inner(listing_type, name)')
      .eq('marina_id', marina.id)
      .order('created_at', { ascending: false });

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, first_name, last_name');

    const merged = (reqData || []).map((r) => ({
      ...r,
      boater: profilesData?.find((p) => p.id === r.user_id),
    }));
    setRequests(merged);
  }

  function openDetail(req: any) {
    setSelected(req);
    setPriceInput(req.quoted_cents != null ? String(req.quoted_cents / 100) : '');
    setDateInput(req.start_date ? parseDateYMD(req.start_date) : null);
    setShowDatePicker(false);
  }

  function onDateChange(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'android') setShowDatePicker(false); // iOS stays open until "Done"
    if (event.type !== 'dismissed' && date) setDateInput(date);
  }

  // 'winterization' keeps its historical notification type; every other
  // booking type uses 'booking' (both are in the notifications type CHECK).
  function selectedType(): string {
    return selected?.marina_listings?.listing_type ?? 'winterization';
  }
  function selectedIsWinterization(): boolean {
    return selectedType() === 'winterization';
  }

  async function notifyBoater(userId: string, message: string, title: string, notifType: string) {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('notifications').insert({
      recipient_id: userId,
      actor_id: user?.id,
      type: notifType === 'winterization' ? 'winterization' : 'booking',
      comment_body: message,
    });
    sendPush(userId, title, message);
  }

  async function approve() {
    if (!selected) return;
    const isWinterization = selectedIsWinterization();
    const label = typeLabel(selectedType()).toLowerCase();
    const price = parseFloat(priceInput);
    if (!priceInput.trim() || Number.isNaN(price)) {
      Alert.alert('Price needed', 'Enter the confirmed price before approving.');
      return;
    }
    // winterization: the marina picks the service date. Slip-like bookings:
    // the boater already chose arrival/departure — approving confirms them,
    // no date to set.
    if (isWinterization && !dateInput) {
      Alert.alert('Date needed', 'Pick a scheduled date before approving.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('bookings')
      .update({
        status: 'approved',
        quoted_cents: Math.round(price * 100),
        ...(isWinterization && dateInput ? { start_date: formatDateYMD(dateInput) } : {}),
      })
      .eq('id', selected.id);
    setSaving(false);
    if (error) {
      Alert.alert('Could not approve', friendlyError(error));
      return;
    }
    await notifyBoater(
      selected.user_id,
      isWinterization && dateInput
        ? `Your winterization request was approved — $${price} on ${formatDateYMD(dateInput)}.`
        : `Your ${label} request was approved — $${price}.`,
      'Request approved',
      selectedType()
    );
    setSelected(null);
    loadRequests();
  }

  function confirmDecline() {
    if (!selected) return;
    Alert.alert('Decline this request?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          const { error } = await supabase
            .from('bookings')
            .update({ status: 'declined' })
            .eq('id', selected.id);
          setSaving(false);
          if (error) {
            Alert.alert('Could not decline', friendlyError(error));
            return;
          }
          await notifyBoater(
            selected.user_id,
            `Your ${typeLabel(selectedType()).toLowerCase()} request was declined.`,
            'Request declined',
            selectedType()
          );
          setSelected(null);
          loadRequests();
        },
      },
    ]);
  }

  async function advanceStatus(next: 'in_progress' | 'completed') {
    if (!selected) return;
    setSaving(true);
    const { error } = await supabase
      .from('bookings')
      .update({ status: next })
      .eq('id', selected.id);
    setSaving(false);
    if (error) {
      Alert.alert('Could not update', friendlyError(error));
      return;
    }
    const isWinterization = selectedIsWinterization();
    const label = typeLabel(selectedType());
    await notifyBoater(
      selected.user_id,
      next === 'in_progress'
        ? (isWinterization ? 'Your boat winterization has started.' : `Your ${label.toLowerCase()} booking is underway.`)
        : (isWinterization ? 'Your boat has been winterized — all done!' : `Your ${label.toLowerCase()} booking is complete.`),
      next === 'in_progress' ? `${label} started` : `${label} complete`,
      selectedType()
    );
    setSelected(null);
    loadRequests();
  }

  const visible =
    activeFilter === 'All' ? requests : requests.filter((r) => r.status === FILTER_STATUS[activeFilter]);

  // still under manual review — no marina row linked to this account yet.
  // (Previously also required winterization_enabled, but a marina offering
  // only slips/storage still needs its inbox.)
  if (!accountLoading && !marina) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.pendingWrap}>
          <Ionicons name="hourglass-outline" size={40} color={Colors.muted} />
          <Text style={styles.pendingTitle}>Application under review</Text>
          <Text style={styles.pendingText}>
            We manually review every marina before it goes live. We'll notify you once your
            marina is approved and booking requests start coming in.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <Text style={styles.brand}>Requests</Text>
        <TouchableOpacity
          style={styles.messagesIconButton}
          onPress={() => navigation.navigate('MarinaMessages')}
          hitSlop={10}
        >
          <Ionicons name="paper-plane-outline" size={22} color={Colors.cream} />
          {unreadMessages > 0 && (
            <View style={styles.messagesBadge}>
              <Text style={styles.messagesBadgeText}>{unreadMessages > 9 ? '9+' : unreadMessages}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, activeFilter === f && styles.filterTabActive]}
            onPress={() => setActiveFilter(f)}
          >
            <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.list}>
        {visible.length === 0 && <Text style={styles.empty}>No requests here yet.</Text>}
        {visible.map((r) => {
          const name = `${r.boater?.first_name || 'Boater'} ${r.boater?.last_name || ''}`.trim();
          return (
            <TouchableOpacity key={r.id} style={styles.card} onPress={() => openDetail(r)}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardName}>{name}</Text>
                <View style={[styles.badge, { backgroundColor: STATUS_COLOR[r.status] }]}>
                  <Text style={styles.badgeText}>{STATUS_LABEL[r.status]}</Text>
                </View>
              </View>
              <Text style={styles.cardType}>{typeLabel(r.marina_listings?.listing_type)}</Text>
              <Text style={styles.cardDetail}>
                {r.boat_type || 'Boat'}{r.boat_length_ft ? ` · ${r.boat_length_ft} ft` : ''}
              </Text>
              {r.status === 'pending' && r.start_date && (
                <Text style={styles.cardDetail}>
                  {r.marina_listings?.listing_type === 'winterization' ? 'Preferred: ' : ''}
                  {r.start_date}{r.end_date ? ` → ${r.end_date}` : ''}
                </Text>
              )}
              <Text style={styles.cardTime}>{timeAgo(r.created_at)}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.backdrop}>
          <Pressable style={styles.spacer} onPress={() => setSelected(null)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheet}>
            <View style={styles.handle} />
            <DismissKeyboardView style={{ flex: 0 }}>
            <ScrollView keyboardShouldPersistTaps="handled">
              {selected && (
                <>
                  <Text style={styles.sheetTitle}>
                    {`${selected.boater?.first_name || 'Boater'} ${selected.boater?.last_name || ''}`.trim()}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: STATUS_COLOR[selected.status], alignSelf: 'flex-start' }]}>
                    <Text style={styles.badgeText}>{STATUS_LABEL[selected.status]}</Text>
                  </View>

                  <DetailRow label="Type" value={typeLabel(selected.marina_listings?.listing_type)} />
                  {selected.marina_listings?.listing_type !== 'winterization' && selected.marina_listings?.name ? (
                    <DetailRow label="Listing" value={selected.marina_listings.name} />
                  ) : null}
                  <DetailRow label="Boat" value={`${selected.boat_type || '—'}${selected.boat_length_ft ? ` · ${selected.boat_length_ft} ft` : ''}`} />
                  {selectedIsWinterization() && (
                    <DetailRow label="Location" value={LOCATION_LABEL[selected.details?.boat_location] || selected.details?.boat_location || '—'} />
                  )}
                  {selected.details?.tow_address ? (
                    <DetailRow label="Tow pickup address" value={selected.details.tow_address} />
                  ) : null}
                  {!selectedIsWinterization() && selected.start_date ? (
                    <DetailRow
                      label="Dates"
                      value={`${selected.start_date}${selected.end_date ? ` → ${selected.end_date}` : ''}`}
                    />
                  ) : null}
                  {selected.boater_notes ? <DetailRow label="Logistics notes" value={selected.boater_notes} /> : null}

                  {selected.status === 'pending' && (
                    <>
                      {selectedIsWinterization() && (
                        <DetailRow label="Preferred date" value={selected.start_date || 'No preference'} />
                      )}
                      {selected.quoted_cents != null && (
                        <DetailRow label="Boater's estimate" value={`$${(selected.quoted_cents / 100).toFixed(0)} (approximate)`} />
                      )}

                      <Text style={styles.inputLabel}>Confirmed price ($)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. 450"
                        placeholderTextColor={Colors.muted}
                        keyboardType="decimal-pad"
                        value={priceInput}
                        onChangeText={setPriceInput}
                      />
                      {/* winterization: marina picks the service date. Slip-like
                          bookings already carry the boater's dates — approving
                          confirms them as-is. */}
                      {selectedIsWinterization() && (
                        <>
                          <Text style={styles.inputLabel}>Scheduled date</Text>
                          <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(true)}>
                            <Text style={{ color: dateInput ? Colors.cream : Colors.muted, fontSize: 15 }}>
                              {dateInput ? formatDateYMD(dateInput) : 'Select a date'}
                            </Text>
                          </TouchableOpacity>

                          {showDatePicker && (
                            <View style={styles.datePickerWrap}>
                              <DateTimePicker
                                value={dateInput ?? new Date()}
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
                        </>
                      )}
                      <View style={styles.actionRow}>
                        <TouchableOpacity style={styles.declineBtn} onPress={confirmDecline} disabled={saving}>
                          <Text style={styles.declineBtnText}>Decline</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.approveBtn} onPress={approve} disabled={saving}>
                          <Text style={styles.approveBtnText}>{saving ? '…' : 'Approve'}</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}

                  {(selected.status === 'approved' || selected.status === 'paid') && (
                    <>
                      <DetailRow label="Confirmed price" value={`$${(selected.quoted_cents / 100).toFixed(0)}`} />
                      {selectedIsWinterization() && <DetailRow label="Scheduled date" value={selected.start_date} />}
                      {selected.status === 'paid' && (
                        <DetailRow
                          label="Deposit"
                          value={`$${((selected.amount_paid_cents ?? 0) / 100).toFixed(0)} paid ✓`}
                        />
                      )}
                      <TouchableOpacity
                        style={[styles.approveBtn, styles.standaloneBtn]}
                        onPress={() => advanceStatus('in_progress')}
                        disabled={saving}
                      >
                        <Text style={styles.approveBtnText}>{saving ? '…' : 'Mark In Progress'}</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {selected.status === 'in_progress' && (
                    <TouchableOpacity
                      style={[styles.approveBtn, styles.standaloneBtn]}
                      onPress={() => advanceStatus('completed')}
                      disabled={saving}
                    >
                      <Text style={styles.approveBtnText}>{saving ? '…' : 'Mark Completed'}</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity style={styles.closeBtn} onPress={() => setSelected(null)}>
                    <Text style={styles.closeBtnText}>Close</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
            </DismissKeyboardView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  brand: { color: Colors.cream, fontSize: 22, fontWeight: 'bold', letterSpacing: 2 },
  messagesIconButton: { padding: 4 },
  messagesBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  messagesBadgeText: { color: Colors.black, fontSize: 10, fontWeight: '700' },

  pendingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  pendingTitle: { color: Colors.cream, fontSize: 18, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  pendingText: { color: Colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // flexGrow: 0 stops the ScrollView itself from expanding to fill leftover
  // vertical space; alignItems: 'center' stops the row's default cross-axis
  // 'stretch' from pulling each pill to fill that height — without both, the
  // tabs render as tall bars instead of small pills.
  filterScroll: { flexGrow: 0, flexShrink: 0 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  filterTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.surface },
  filterTabActive: { backgroundColor: Colors.gold },
  filterText: { color: Colors.muted, fontSize: 13 },
  filterTextActive: { color: Colors.black, fontWeight: '700' },

  list: { paddingHorizontal: 16, paddingBottom: 150 },
  empty: { color: Colors.muted, fontSize: 14, textAlign: 'center', marginTop: 40 },

  card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardName: { color: Colors.cream, fontSize: 15, fontWeight: '700' },
  cardType: { color: Colors.gold, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 },
  cardDetail: { color: Colors.muted, fontSize: 13, marginBottom: 2 },
  cardTime: { color: Colors.muted, fontSize: 11, marginTop: 4 },

  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { color: Colors.white, fontSize: 11, fontWeight: '700' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  spacer: { flex: 1 },
  sheet: { backgroundColor: Colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#3A3A3A', alignSelf: 'center', marginBottom: 8 },
  sheetTitle: { color: Colors.cream, fontSize: 18, fontWeight: '700', marginBottom: 8 },

  detailRow: { marginTop: 14 },
  detailLabel: { color: Colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 2 },
  detailValue: { color: Colors.cream, fontSize: 15 },

  inputLabel: { color: Colors.cream, fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.cream,
    fontSize: 15,
  },

  datePickerWrap: { alignItems: 'center', marginTop: 8 },
  datePickerDone: { alignSelf: 'stretch', backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  datePickerDoneText: { color: Colors.black, fontWeight: '700', fontSize: 14 },

  actionRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  declineBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.surface },
  declineBtnText: { color: '#FF6B6B', fontWeight: '700', fontSize: 15 },
  approveBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.gold },
  approveBtnText: { color: Colors.black, fontWeight: '700', fontSize: 15 },
  standaloneBtn: { marginTop: 16 },

  closeBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 8, marginBottom: 20 },
  closeBtnText: { color: Colors.muted, fontSize: 14, fontWeight: '600' },
});
