import { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, PanResponder, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Weather } from '../../lib/weather';
import WindCompass from './WindCompass';

// Live-conditions panel for the map. Opened by the top-left conditions icon;
// slides up ABOVE the floating tab-bar pill (which sits ~90px off the bottom).
// Drag DOWN on the panel to dismiss — the drag starts on the sheet itself, not a
// screen edge, so it never fights iOS's home/back edge gestures.

const SHEET_HEIGHT = Math.min(390, Dimensions.get('window').height * 0.54);
const TABBAR_CLEARANCE = 100; // sit above the floating tab pill (top ≈ 90px up)
const CLOSED = SHEET_HEIGHT + 140; // translateY that parks it fully off-screen

const CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
function cardinal(deg: number) {
  return CARDINALS[Math.round(deg / 22.5) % 16];
}

type Props = {
  visible: boolean;
  onClose: () => void;
  weather: Weather | null;
};

export default function ConditionsSheet({ visible, onClose, weather }: Props) {
  const translateY = useRef(new Animated.Value(CLOSED)).current;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: visible ? 0 : CLOSED,
      useNativeDriver: true,
      bounciness: 4,
    }).start();
  }, [visible, translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => translateY.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 90 || g.vy > 0.5) onClose();
        else Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
      },
    })
  ).current;

  return (
    <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
      {/* grab handle + title — the drag-down-to-close target */}
      <View {...panResponder.panHandlers}>
        <View style={styles.grip} />
        <View style={styles.header}>
          <Text style={styles.title}>Conditions</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.closeBtn}>
            <Ionicons name="chevron-down" size={20} color={Colors.cream} />
          </TouchableOpacity>
        </View>
      </View>

      {weather ? (
        <View style={styles.body}>
          <View style={styles.compassWrap}>
            <WindCompass windSpeed={weather.windSpeed} windDirection={weather.windDirection} />
            <Text style={styles.compassCaption}>From {cardinal(weather.windDirection)}</Text>
          </View>

          <View style={styles.cardRow}>
            <StatCard icon="thermometer" label="Feels like" value={`${weather.feelsLike}°`} />
            <StatCard icon="weather-windy" label="Gust" value={`${weather.windGust}`} unit="km/h" />
            <StatCard icon="weather-pouring" label="Precip" value={`${weather.precipitation}`} unit="mm" />
          </View>
        </View>
      ) : (
        <View style={styles.body}>
          <Text style={styles.unavailable}>
            Conditions couldn’t load. They’ll refresh when you’re back online.
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

function StatCard({ icon, label, value, unit }: { icon: any; label: string; value: string; unit?: string }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardIcon}>
        <MaterialCommunityIcons name={icon} size={18} color={Colors.gold} />
      </View>
      <Text style={styles.cardValue}>
        {value}
        {unit ? <Text style={styles.cardUnit}> {unit}</Text> : null}
      </Text>
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: TABBAR_CLEARANCE,
    height: SHEET_HEIGHT,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 14,
  },
  grip: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.surfaceAlt,
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 6,
  },
  title: { color: Colors.cream, fontSize: 20, fontWeight: '800', letterSpacing: 0.2 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingTop: 2 },
  compassWrap: { alignItems: 'center', marginBottom: 18 },
  compassCaption: {
    color: Colors.cream,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginTop: 8,
  },
  cardRow: { flexDirection: 'row', gap: 10 },
  card: {
    flex: 1,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(194,162,78,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardValue: { color: Colors.cream, fontSize: 20, fontWeight: '800' },
  cardUnit: { color: Colors.muted, fontSize: 12, fontWeight: '600' },
  cardLabel: { color: Colors.muted, fontSize: 12, fontWeight: '600' },
  unavailable: { color: Colors.muted, fontSize: 14, textAlign: 'center', paddingVertical: 20, lineHeight: 20 },
});
