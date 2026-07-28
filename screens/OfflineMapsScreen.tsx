import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import {
  getRegions,
  removeRegion,
  clearAllOfflineMaps,
  getCacheSizeBytes,
  formatBytes,
  OfflineRegion,
} from '../lib/offlineTiles';

function formatWhen(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function OfflineMapsScreen() {
  const [regions, setRegions] = useState<OfflineRegion[]>([]);
  const [bytes, setBytes] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    Promise.all([getRegions(), getCacheSizeBytes()]).then(([r, b]) => {
      setRegions(r);
      setBytes(b);
      setLoaded(true);
    });
  }, []);

  useFocusEffect(load);

  function confirmRemove(region: OfflineRegion) {
    Alert.alert('Remove saved area', 'Remove this area from your list?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeRegion(region.id);
          load();
        },
      },
    ]);
  }

  function confirmClearAll() {
    Alert.alert(
      'Delete all offline maps',
      'This frees up all downloaded map data. You can re-download areas anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: async () => {
            await clearAllOfflineMaps();
            load();
          },
        },
      ]
    );
  }

  function renderItem({ item }: { item: OfflineRegion }) {
    return (
      <View style={styles.row}>
        <View style={styles.rowIcon}>
          <Ionicons name="map" size={18} color={Colors.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{item.name}</Text>
          <Text style={styles.rowMeta}>
            {item.tiles.toLocaleString()} tiles · z{item.minZ}–{item.maxZ} · {formatWhen(item.savedAt)}
          </Text>
        </View>
        <TouchableOpacity onPress={() => confirmRemove(item)} hitSlop={10}>
          <Ionicons name="trash-outline" size={18} color={Colors.muted} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={regions}
        keyExtractor={(r) => r.id}
        renderItem={renderItem}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <Text style={styles.summary}>
            {regions.length} saved {regions.length === 1 ? 'area' : 'areas'} · {formatBytes(bytes)} on device
          </Text>
        }
        ListEmptyComponent={
          loaded ? (
            <View style={styles.empty}>
              <Ionicons name="cloud-offline-outline" size={40} color={Colors.muted} />
              <Text style={styles.emptyTitle}>No offline maps yet</Text>
              <Text style={styles.emptyBody}>
                On the map, frame an area and tap the download button to save it — base map and depth
                shading — for use with no signal.
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          regions.length > 0 ? (
            <TouchableOpacity style={styles.clearBtn} onPress={confirmClearAll}>
              <Ionicons name="trash-outline" size={18} color="#FF4444" />
              <Text style={styles.clearText}>Delete all offline maps</Text>
            </TouchableOpacity>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, paddingBottom: 60, flexGrow: 1 },
  summary: { color: Colors.muted, fontSize: 13, marginBottom: 12, marginLeft: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { color: Colors.cream, fontSize: 15, fontWeight: '700' },
  rowMeta: { color: Colors.muted, fontSize: 12, marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 90, gap: 10 },
  emptyTitle: { color: Colors.cream, fontSize: 17, fontWeight: '700' },
  emptyBody: { color: Colors.muted, fontSize: 14, textAlign: 'center', paddingHorizontal: 26, lineHeight: 20 },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginTop: 8,
  },
  clearText: { color: '#FF4444', fontSize: 15, fontWeight: '600' },
});
