import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { supabase } from '../lib/supabase';
import BookingRequestCard from './components/BookingRequestCard';

export default function MyRequestsScreen() {
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

    // every booking type — the joined listing_type labels each card.
    const { data: reqData } = await supabase
      .from('bookings')
      .select('*, marina_listings!inner(listing_type, name)')
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
            No requests yet. Visit a marina's profile to send one.
          </Text>
        )}

        {requests.map((r) => (
          <BookingRequestCard
            key={r.id}
            request={r}
            marinaName={r.marina?.name || 'Marina'}
            onPaid={load}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, paddingBottom: 60 },
  empty: { color: Colors.muted, fontSize: 14, textAlign: 'center', marginTop: 40 },
});
