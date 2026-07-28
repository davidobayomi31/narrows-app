import { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, PanResponder, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Weather } from '../../lib/weather';
import WindCompass from './WindCompass';

// Live-conditions bottom sheet for the map. A small handle sits at the bottom;
// drag it up (or tap) to reveal wind + weather detail, drag down to dismiss.
// Built on core Animated + PanResponder so it needs no gesture-handler dep.
// Deliberately a BOTTOM sheet — a left-edge drawer would fight iOS back-swipe.

const PEEK = 92; // height visible while collapsed (handle + quick summary)
const SHEET_HEIGHT = Math.min(430, Dimensions.get('window').height * 0.6);
const HIDDEN_OFFSET = SHEET_HEIGHT - PEEK; // translateY when collapsed

type Props = {
  weather: Weather | null;
};

export default function ConditionsSheet({ weather }: Props) {
  // translateY: 0 = fully open, HIDDEN_OFFSET = collapsed to the peek
  const translateY = useRef(new Animated.Value(HIDDEN_OFFSET)).current;
  const currentY = useRef(HIDDEN_OFFSET);
  const dragStartY = useRef(HIDDEN_OFFSET);

  // keep a JS mirror of the animated value so a drag starts from where it is
  useEffect(() => {
    const id = translateY.addListener(({ value }) => {
      currentY.current = value;
    });
    return () => translateY.removeListener(id);
  }, [translateY]);

  function snapTo(open: boolean) {
    Animated.spring(translateY, {
      toValue: open ? 0 : HIDDEN_OFFSET,
      useNativeDriver: true,
      bounciness: 4,
    }).start();
  }

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4,
      onPanResponderGrant: () => {
        dragStartY.current = currentY.current;
      },
      onPanResponderMove: (_e, g) => {
        const next = Math.min(HIDDEN_OFFSET, Math.max(0, dragStartY.current + g.dy));
        translateY.setValue(next);
      },
      onPanResponderRelease: (_e, g) => {
        // decide by velocity first, then by which snap point is nearer
        if (g.vy < -0.5) return snapTo(true);
        if (g.vy > 0.5) return snapTo(false);
        snapTo(currentY.current < HIDDEN_OFFSET / 2);
      },
    })
  ).current;

  const summary = weather
    ? `${weather.temp}°C · Wind ${weather.windSpeed} km/h`
    : 'Conditions unavailable';

  return (
    <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
      {/* grab handle + collapsed summary — the drag target */}
      <View {...panResponder.panHandlers}>
        <TouchableOpacity activeOpacity={0.9} onPress={() => snapTo(currentY.current > HIDDEN_OFFSET / 2)}>
          <View style={styles.grip} />
          <View style={styles.peekRow}>
            <MaterialCommunityIcons name="weather-partly-cloudy" size={20} color={Colors.gold} />
            <Text style={styles.peekText}>{summary}</Text>
            <Ionicons name="chevron-up" size={18} color={Colors.muted} />
          </View>
        </TouchableOpacity>
      </View>

      {/* expanded detail */}
      {weather ? (
        <View style={styles.body}>
          <View style={styles.compassWrap}>
            <WindCompass windSpeed={weather.windSpeed} windDirection={weather.windDirection} />
            <Text style={styles.compassCaption}>Wind km/h</Text>
          </View>

          <View style={styles.grid}>
            <Stat icon="thermometer" label="Feels like" value={`${weather.feelsLike}°`} />
            <Stat icon="weather-windy" label="Gust" value={`${weather.windGust}`} />
            <Stat icon="water-percent" label="Humidity" value={`${weather.humidity}%`} />
            <Stat icon="weather-rainy" label="Precip" value={`${weather.precipitation} mm`} />
            <Stat icon="weather-sunny" label="UV" value={`${weather.uvIndex}`} />
            <Stat icon="white-balance-sunny" label="Sun" value={`${weather.sunrise}`} />
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

function Stat({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <MaterialCommunityIcons name={icon} size={18} color={Colors.gold} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SHEET_HEIGHT,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 12,
  },
  grip: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.surfaceAlt,
    marginTop: 8,
    marginBottom: 8,
  },
  peekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 10,
  },
  peekText: { flex: 1, color: Colors.cream, fontSize: 15, fontWeight: '700' },
  body: { paddingTop: 6 },
  compassWrap: { alignItems: 'center', marginBottom: 16 },
  compassCaption: { color: Colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 6 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
  },
  stat: {
    width: '30%',
    alignItems: 'center',
    gap: 3,
  },
  statValue: { color: Colors.cream, fontSize: 17, fontWeight: '800' },
  statLabel: { color: Colors.muted, fontSize: 11, fontWeight: '600' },
  unavailable: { color: Colors.muted, fontSize: 14, textAlign: 'center', paddingVertical: 20, lineHeight: 20 },
});
