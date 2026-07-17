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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';
import { useAccount } from '../contexts/AccountContext';

const FILTERS = ['All', 'Requested', 'Approved', 'In Progress', 'Completed', 'Declined'];
const FILTER_STATUS: Record<string, string> = {
  Requested: 'requested',
  Approved: 'approved',
  'In Progress': 'in_progress',
  Completed: 'completed',
  Declined: 'declined',
};

const STATUS_LABEL: Record<string, string> = {
  requested: 'Requested',
  approved: 'Approved',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  declined: 'Declined',
};
const STATUS_COLOR: Record<string, string> = {
  requested: '#92400E',
  approved: '#1B4FD8',
  scheduled: '#1B4FD8',
  in_progress: '#6B4E9E',
  completed: '#166534',
  declined: '#7F1D1D',
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
  const { loading: accountLoading, marina } = useAccount();
  const [activeFilter, setActiveFilter] = useState('All');
  const [requests, setRequests] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (marina?.id) loadRequests();
    }, [marina?.id])
  );

  async function loadRequests() {
    if (!marina?.id) return;
    const { data: reqData } = await supabase
      .from('winterization_requests')
      .select('*')
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
    setPriceInput(req.marina_price != null ? String(req.marina_price) : '');
    setDateInput(req.scheduled_date ?? '');
  }

  async function notifyBoater(userId: string, message: string) {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('notifications').insert({
      recipient_id: userId,
      actor_id: user?.id,
      type: 'winterization',
      comment_body: message,
    });
  }

  async function approve() {
    if (!selected) return;
    const price = parseFloat(priceInput);
    if (!priceInput.trim() || Number.isNaN(price)) {
      Alert.alert('Price needed', 'Enter the confirmed price before approving.');
      return;
    }
    if (!dateInput.trim()) {
      Alert.alert('Date needed', 'Enter a scheduled date before approving.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('winterization_requests')
      .update({ status: 'approved', marina_price: price, scheduled_date: dateInput.trim() })
      .eq('id', selected.id);
    setSaving(false);
    if (error) {
      Alert.alert('Could not approve', friendlyError(error));
      return;
    }
    await notifyBoater(
      selected.user_id,
      `Your winterization request was approved — $${price} on ${dateInput.trim()}.`
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
            .from('winterization_requests')
            .update({ status: 'declined' })
            .eq('id', selected.id);
          setSaving(false);
          if (error) {
            Alert.alert('Could not decline', friendlyError(error));
            return;
          }
          await notifyBoater(selected.user_id, 'Your winterization request was declined.');
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
      .from('winterization_requests')
      .update({ status: next })
      .eq('id', selected.id);
    setSaving(false);
    if (error) {
      Alert.alert('Could not update', friendlyError(error));
      return;
    }
    await notifyBoater(
      selected.user_id,
      next === 'in_progress'
        ? 'Your boat winterization has started.'
        : 'Your boat has been winterized — all done!'
    );
    setSelected(null);
    loadRequests();
  }

  const visible =
    activeFilter === 'All' ? requests : requests.filter((r) => r.status === FILTER_STATUS[activeFilter]);

  // still under manual review, or approved but not yet enabled for requests
  if (!accountLoading && (!marina || !marina.winterization_enabled)) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.pendingWrap}>
          <Ionicons name="hourglass-outline" size={40} color={Colors.muted} />
          <Text style={styles.pendingTitle}>Application under review</Text>
          <Text style={styles.pendingText}>
            We manually review every marina before it goes live. We'll notify you once your
            marina is approved and winterization requests start coming in.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <Text style={styles.brand}>Requests</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
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
              <Text style={styles.cardDetail}>
                {r.boat_type || 'Boat'}{r.boat_length_ft ? ` · ${r.boat_length_ft} ft` : ''}
              </Text>
              {r.preferred_date && <Text style={styles.cardDetail}>Preferred: {r.preferred_date}</Text>}
              <Text style={styles.cardTime}>{timeAgo(r.created_at)}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.backdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheet}>
            <ScrollView keyboardShouldPersistTaps="handled">
              {selected && (
                <>
                  <Text style={styles.sheetTitle}>
                    {`${selected.boater?.first_name || 'Boater'} ${selected.boater?.last_name || ''}`.trim()}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: STATUS_COLOR[selected.status], alignSelf: 'flex-start' }]}>
                    <Text style={styles.badgeText}>{STATUS_LABEL[selected.status]}</Text>
                  </View>

                  <DetailRow label="Boat" value={`${selected.boat_type || '—'}${selected.boat_length_ft ? ` · ${selected.boat_length_ft} ft` : ''}`} />
                  <DetailRow label="Location" value={LOCATION_LABEL[selected.boat_location] || selected.boat_location} />
                  {selected.logistics_notes ? <DetailRow label="Logistics notes" value={selected.logistics_notes} /> : null}
                  <DetailRow label="Preferred date" value={selected.preferred_date || 'No preference'} />
                  {selected.estimated_price != null && (
                    <DetailRow label="Boater's estimate" value={`$${selected.estimated_price} (approximate)`} />
                  )}

                  {selected.status === 'requested' && (
                    <>
                      <Text style={styles.inputLabel}>Confirmed price ($)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. 450"
                        placeholderTextColor={Colors.muted}
                        keyboardType="decimal-pad"
                        value={priceInput}
                        onChangeText={setPriceInput}
                      />
                      <Text style={styles.inputLabel}>Scheduled date</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={Colors.muted}
                        value={dateInput}
                        onChangeText={setDateInput}
                      />
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

                  {selected.status === 'approved' && (
                    <>
                      <DetailRow label="Confirmed price" value={`$${selected.marina_price}`} />
                      <DetailRow label="Scheduled date" value={selected.scheduled_date} />
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
  topBar: { paddingHorizontal: 16, paddingVertical: 10 },
  brand: { color: Colors.cream, fontSize: 22, fontWeight: 'bold', letterSpacing: 2 },

  pendingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  pendingTitle: { color: Colors.cream, fontSize: 18, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  pendingText: { color: Colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },

  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  filterTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.surface },
  filterTabActive: { backgroundColor: Colors.gold },
  filterText: { color: Colors.muted, fontSize: 13 },
  filterTextActive: { color: Colors.black, fontWeight: '700' },

  list: { paddingHorizontal: 16, paddingBottom: 150 },
  empty: { color: Colors.muted, fontSize: 14, textAlign: 'center', marginTop: 40 },

  card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardName: { color: Colors.cream, fontSize: 15, fontWeight: '700' },
  cardDetail: { color: Colors.muted, fontSize: 13, marginBottom: 2 },
  cardTime: { color: Colors.muted, fontSize: 11, marginTop: 4 },

  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { color: Colors.white, fontSize: 11, fontWeight: '700' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
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

  actionRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  declineBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.surface },
  declineBtnText: { color: '#FF6B6B', fontWeight: '700', fontSize: 15 },
  approveBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.gold },
  approveBtnText: { color: Colors.black, fontWeight: '700', fontSize: 15 },
  standaloneBtn: { marginTop: 16 },

  closeBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 8, marginBottom: 20 },
  closeBtnText: { color: Colors.muted, fontSize: 14, fontWeight: '600' },
});
