import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { Colors } from '../../constants/colors';
import { supabase } from '../../lib/supabase';

const STEPS = [
  { key: 'pending', label: 'Requested' },
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

type Props = {
  request: any;
  // pass this on a screen listing requests across multiple marinas; omit it
  // when the card already lives on that marina's own page.
  marinaName?: string;
  // called after a successful payment so the screen can refetch and make the
  // Pay button disappear (payment_intent_id is now set on the booking).
  onPaid?: () => void;
};

export default function WinterizationRequestCard({ request: r, marinaName, onPaid }: Props) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [paying, setPaying] = useState(false);

  const amountCents = r.deposit_cents ?? r.quoted_cents;
  const showPayButton = r.status === 'approved' && !r.payment_intent_id && amountCents > 0;

  async function handlePay() {
    setPaying(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-payment-intent', {
        body: { booking_id: r.id },
      });
      if (error || !data?.client_secret) {
        throw new Error(error?.message || 'Could not start payment');
      }

      const { error: sheetError } = await initPaymentSheet({
        merchantDisplayName: 'Narrows',
        paymentIntentClientSecret: data.client_secret,
      });
      if (sheetError) throw new Error(sheetError.message);

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        // Canceled is not a real failure — the boater just backed out.
        if (presentError.code !== 'Canceled') {
          Alert.alert('Payment failed', presentError.message);
        }
        return;
      }

      Alert.alert('Payment successful', 'Your deposit has been paid.');
      onPaid?.();
    } catch (err) {
      Alert.alert('Payment failed', (err as Error).message);
    } finally {
      setPaying(false);
    }
  }

  return (
    <View style={styles.card}>
      {marinaName && <Text style={styles.marinaName}>{marinaName}</Text>}
      <Text style={styles.detail}>
        {r.boat_type || 'Boat'}{r.boat_length_ft ? ` · ${r.boat_length_ft} ft` : ''}
      </Text>
      <Text style={styles.detail}>{LOCATION_LABEL[r.details?.boat_location] || r.details?.boat_location}</Text>

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
          {r.quoted_cents != null && <Text style={styles.confirmedText}>Confirmed price: ${(r.quoted_cents / 100).toFixed(0)}</Text>}
          {r.start_date && <Text style={styles.confirmedText}>Scheduled: {r.start_date}</Text>}
          {r.payment_intent_id && <Text style={styles.confirmedText}>Deposit paid ✓</Text>}
        </View>
      ) : r.quoted_cents != null ? (
        <Text style={styles.estimateText}>Estimate: ${(r.quoted_cents / 100).toFixed(0)} (approximate)</Text>
      ) : null}

      {showPayButton && (
        <Pressable style={styles.payButton} onPress={handlePay} disabled={paying}>
          {paying ? (
            <ActivityIndicator color={Colors.background} />
          ) : (
            <Text style={styles.payButtonText}>Pay ${(amountCents / 100).toFixed(0)} deposit</Text>
          )}
        </Pressable>
      )}

      <Text style={styles.time}>Sent {timeAgo(r.created_at)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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

  payButton: { backgroundColor: Colors.gold, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  payButtonText: { color: Colors.background, fontSize: 14, fontWeight: '700' },

  confirmedBox: { marginTop: 12, backgroundColor: Colors.surfaceAlt, borderRadius: 10, padding: 10 },
  confirmedText: { color: Colors.cream, fontSize: 13 },
  estimateText: { color: Colors.muted, fontSize: 12, marginTop: 12 },

  time: { color: Colors.muted, fontSize: 11, marginTop: 10 },
});
