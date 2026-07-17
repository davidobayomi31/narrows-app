import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../constants/colors';

// First fork after signup: every new account is either a Boater (the existing
// app experience, unchanged) or a Marina Partner (gets everything a Boater
// does, PLUS a Requests dashboard for tracking winterization bookings).
export default function AccountTypeScreen() {
  const navigation = useNavigation<any>();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Welcome to Narrows</Text>
        <Text style={styles.subtitle}>How will you be using the app?</Text>

        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Onboarding')}
        >
          <Ionicons name="boat-outline" size={32} color={Colors.gold} />
          <Text style={styles.cardTitle}>I'm a Boater</Text>
          <Text style={styles.cardSubtitle}>
            Track trips, share catches, and find marinas near you.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('MarinaOnboarding')}
        >
          <Ionicons name="business-outline" size={32} color={Colors.gold} />
          <Text style={styles.cardTitle}>I'm a Marina Partner</Text>
          <Text style={styles.cardSubtitle}>
            Manage your marina's profile and boat winterization requests.
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 60 },
  title: { color: Colors.cream, fontSize: 28, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { color: '#8899AA', fontSize: 14, marginBottom: 32 },
  card: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333333',
    padding: 20,
    marginBottom: 16,
  },
  cardTitle: { color: Colors.cream, fontSize: 18, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  cardSubtitle: { color: '#8899AA', fontSize: 14, lineHeight: 20 },
});
