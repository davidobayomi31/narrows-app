import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/colors';

export default function FeedScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Feed</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: Colors.cream,
    fontSize: 24,
    fontWeight: 'bold',
  },
});
