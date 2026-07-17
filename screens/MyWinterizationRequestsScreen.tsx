import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { supabase } from '../lib/supabase';

const STEPS = [
  { key: 'requested', label: 'Requested' },
  { key: 'approved', label: 'Approved' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
];

const LOCATION_LABEL: Record<string, string> = {
  at_marina: 'Already at the marina',
  needs_drop_off: 'Bringing it in myself',
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

export default function MyWinterizationRequestsScreen() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: reqData } = await supabase
      .from('winterization_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    const { data: marinasData } = await supabase.from('marinas').select('id, name');

    const merged = (reqData || []).map((r) => ({
      ...r,
      marina: marinasData?.find((m) => m.id === r.marina_id),
    }));
    setRequests(merged);
    setLoading(false);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        {!loading && requests.length === 0 && (
          <Text style={styles.empty}>
            No winterization requests yet. Visit a marina's profile to send one.
          </Text>
        )}

        {requests.map((r) => (
          <View key={r.id} style={styles.card}>
            <Text style={styles.marinaName}>{r.marina?.name || 'Marina'}</Text>
            <Text style={styles.detail}>
              {r.boat_type || 'Boat'}{r.boat_length_ft ? ` · ${r.boat_length_ft} ft` : ''}
            </Text>
            <Text style={styles.detail}>{LOCATION_LABEL[r.boat_location] || r.boat_location}</Text>

            {r.status === 'declined' ? (
              <View style={styles.declinedBadge}>
                <Ionicons name="close-circle" size={16} color="#FF6B6B" />
                <Text style={styles.declinedText}>Declined by marina</Text>
              </View>
            ) : (
              <View style={styles.stepper}>
                {STEPS.map((step, i) => {
                  const currentIndex = STEPS.findIndex((s) => s.key === r.status);
                  const done = i <= currentIndex;
                  return (
                    <View key={step.key} style={styles.stepWrap}>
                      <View style={styles.stepRow}>
                        <View style={[styles.stepDot, done && styles.stepDotDone]} />
                        {i < STEPS.length - 1 && <View style={[styles.stepLine, i < currentIndex && styles.stepLineDone]} />}
                      </View>
                      <Text style={[styles.stepLabel, done && styles.stepLabelDone]}>{step.label}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {r.status === 'approved' || r.status === 'in_progress' || r.status === 'completed' ? (
              <View style={styles.confirmedBox}>
                {r.marina_price != null && <Text style={styles.confirmedText}>Confirmed price: ${r.marina_price}</Text>}
                {r.scheduled_date && <Text style={styles.confirmedText}>Scheduled: {r.scheduled_date}</Text>}
              </View>
            ) : r.estimated_price != null ? (
              <Text style={styles.estimateText}>Estimate: ${r.estimated_price} (approximate)</Text>
            ) : null}

            <Text style={styles.time}>Sent {timeAgo(r.created_at)}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, paddingBottom: 60 },
  empty: { color: Colors.muted, fontSize: 14, textAlign: 'center', marginTop: 40 },

  card: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 14 },
  marinaName: { color: Colors.cream, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  detail: { color: Colors.muted, fontSize: 13, marginBottom: 2 },

  stepper: { flexDirection: 'row', marginTop: 16, marginBottom: 4 },
  stepWrap: { flex: 1, alignItems: 'center' },
  stepRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  stepDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.surfaceAlt },
  stepDotDone: { backgroundColor: Colors.gold },
  stepLine: { flex: 1, height: 2, backgroundColor: Colors.surfaceAlt },
  stepLineDone: { backgroundColor: Colors.gold },
  stepLabel: { color: Colors.muted, fontSize: 10, marginTop: 6, textAlign: 'center' },
  stepLabelDone: { color: Colors.gold, fontWeight: '700' },

  declinedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  declinedText: { color: '#FF6B6B', fontSize: 13, fontWeight: '600' },

  confirmedBox: { marginTop: 12, backgroundColor: Colors.surfaceAlt, borderRadius: 10, padding: 10 },
  confirmedText: { color: Colors.cream, fontSize: 13 },
  estimateText: { color: Colors.muted, fontSize: 12, marginTop: 12 },

  time: { color: Colors.muted, fontSize: 11, marginTop: 10 },
});
