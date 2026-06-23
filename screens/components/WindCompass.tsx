import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Magnetometer } from 'expo-sensors';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';

type Props = {
  windSpeed: number;
  windDirection: number; // degrees the wind comes FROM (0 = N)
};

// turn raw magnetometer x/y into a 0–359° heading
function calcHeading(x: number, y: number) {
  let angle = Math.atan2(y, x) * (180 / Math.PI);
  angle = angle - 90; // align sensor axis with "up = north"
  if (angle < 0) angle += 360;
  return angle;
}

export default function WindCompass({ windSpeed, windDirection }: Props) {
  const [heading, setHeading] = useState(0);

  useEffect(() => {
    Magnetometer.setUpdateInterval(100); // 10x/sec is smooth enough
    const sub = Magnetometer.addListener(({ x, y }) => {
      setHeading(calcHeading(x, y));
    });
    return () => sub.remove(); // stop listening when the screen goes away
  }, []);

  // rose spins opposite the phone so true north stays fixed in space
  const roseRotation = -heading;
  // arrowhead points where the wind is GOING, relative to where you're facing.
  // windDirection is the "coming from" bearing, so +180 flips it to downwind;
  // subtract heading so it keeps aiming the right way as you turn.
  const arrowRotation = windDirection + 180 - heading;

  return (
    <View style={styles.compass}>
      {/* rotating rose */}
      <View style={[styles.rose, { transform: [{ rotate: `${roseRotation}deg` }] }]}>
        <Text style={[styles.cardinal, styles.north]}>N</Text>
        <Text style={[styles.cardinal, styles.east]}>E</Text>
        <Text style={[styles.cardinal, styles.south]}>S</Text>
        <Text style={[styles.cardinal, styles.west]}>W</Text>
      </View>

      {/* wind arrow: arrowhead points where the wind is GOING; dot is the upwind tail */}
      <View style={[styles.arrowWrap, { transform: [{ rotate: `${arrowRotation}deg` }] }]}>
        <Ionicons name="caret-up" size={20} color={Colors.gold} />
        <View style={styles.shaft} />
        <View style={styles.dot} />
      </View>

      {/* fixed "ahead" marker (your facing / the bow) — never rotates */}
      <View style={styles.ahead} />

      {/* center reading (drawn last so it sits on top) */}
      <View style={styles.center}>
        <Text style={styles.speed}>{windSpeed}</Text>
        <Text style={styles.unit}>km/h</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  compass: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1,
    borderColor: '#2E4057',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rose: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardinal: {
    position: 'absolute',
    color: '#8899AA',
    fontSize: 12,
    fontWeight: '700',
  },
  north: { top: 6 },
  south: { bottom: 6 },
  east: { right: 8 },
  west: { left: 8 },
  arrowWrap: {
    position: 'absolute',
    height: 104,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shaft: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.gold,
    marginVertical: 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.cream,
  },
  ahead: {
    position: 'absolute',
    top: -5,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: Colors.cream,
  },
  center: {
    alignItems: 'center',
  },
  speed: { color: Colors.cream, fontSize: 22, fontWeight: '700' },
  unit: { color: '#8899AA', fontSize: 11, marginTop: -2 },
});