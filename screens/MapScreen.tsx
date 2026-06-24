import { View, StyleSheet } from 'react-native';
import MapView from 'react-native-maps';

export default function MapScreen() {
  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: 44.62,    // Lake Couchiching / Orillia
          longitude: -79.40,
          latitudeDelta: 0.15,
          longitudeDelta: 0.15,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
});