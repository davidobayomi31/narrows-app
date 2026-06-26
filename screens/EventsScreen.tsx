import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

export default function EventsScreen() {
  return (
    <View style={styles.screen}>
      <Ionicons name="calendar-outline" size={56} color={Colors.gold} />
      <Text style={styles.title}>No events on the water yet</Text>
      <Text style={styles.sub}>
        There’s nothing happening right now — but check back soon. We’ll post marina
        events, tournaments, and meetups here all season.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  title: { color: Colors.cream, fontSize: 20, fontWeight: '700', marginTop: 16, textAlign: 'center' },
  sub: { color: Colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10 },
});