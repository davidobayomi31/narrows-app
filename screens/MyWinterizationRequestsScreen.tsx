import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { supabase } from '../lib/supabase';
import WinterizationRequestCard from './components/WinterizationRequestCard';

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

    // !inner filters on the joined table's column — only bookings whose
    // listing is a winterization listing come back.
    const { data: reqData } = await supabase
      .from('bookings')
      .select('*, marina_listings!inner(listing_type)')
      .eq('user_id', user.id)
      .eq('marina_listings.listing_type', 'winterization')
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
          <WinterizationRequestCard key={r.id} request={r} marinaName={r.marina?.name || 'Marina'} />
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
