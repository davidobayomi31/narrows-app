import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';

// Pure-JS date-of-birth picker — deliberately not `@react-native-community/
// datetimepicker`. That library's iOS 17+ inline/compact mode uses
// `UICalendarView`, which asserts on `_setVisibleMonth:` when the selected
// date is far from today (common for a DOB). This component is React Native
// primitives only, so it can't hit that native assertion.

type Props = {
  value: Date | null;
  onChange: (d: Date) => void;
  minYear?: number;
  maxYear?: number; // defaults to current year
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function DobCalendar({ value, onChange, minYear = 1900, maxYear = new Date().getFullYear() }: Props) {
  // View state — what month is being shown. Defaults to Jan 2000 (a decent
  // starting point for adult DOBs) if nothing is selected yet.
  const initial = value ?? new Date(2000, 0, 1);
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth()); // 0-11
  const [pickingYear, setPickingYear] = useState(false);

  const today = new Date();

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    if (d.getFullYear() < minYear || d.getFullYear() > maxYear) return;
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  // Grid: first day of month + a blank cell for each weekday before it,
  // then 1..daysInMonth.
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const leadingBlanks = firstOfMonth.getDay(); // 0 = Sunday
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function isFutureDay(day: number) {
    const d = new Date(viewYear, viewMonth, day);
    return d.getTime() > today.getTime();
  }
  function isSelectedDay(day: number) {
    return value != null &&
      value.getFullYear() === viewYear &&
      value.getMonth() === viewMonth &&
      value.getDate() === day;
  }

  if (pickingYear) {
    // Year picker — scrollable grid, newest first (most DOBs are in the
    // recent few decades so scanning from top is faster than the reverse).
    const years: number[] = [];
    for (let y = maxYear; y >= minYear; y--) years.push(y);
    return (
      <View style={styles.wrap}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setPickingYear(false)} style={styles.headerBack}>
            <Ionicons name="chevron-back" size={18} color={Colors.cream} />
            <Text style={styles.headerBackText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Pick a year</Text>
          <View style={styles.headerBack} />
        </View>
        <ScrollView style={styles.yearScroll} contentContainerStyle={styles.yearGrid}>
          {years.map((y) => {
            const active = y === viewYear;
            return (
              <TouchableOpacity
                key={y}
                style={[styles.yearCell, active && styles.yearCellActive]}
                onPress={() => { setViewYear(y); setPickingYear(false); }}
              >
                <Text style={[styles.yearCellText, active && styles.yearCellTextActive]}>{y}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => shiftMonth(-1)} style={styles.navButton}>
          <Ionicons name="chevron-back" size={18} color={Colors.cream} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setPickingYear(true)} style={styles.headerTitleButton}>
          <Text style={styles.headerTitle}>{MONTHS[viewMonth]} {viewYear}</Text>
          <Ionicons name="chevron-down" size={14} color={Colors.cream} style={{ marginLeft: 4 }} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => shiftMonth(1)} style={styles.navButton}>
          <Ionicons name="chevron-forward" size={18} color={Colors.cream} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={styles.weekdayText}>{w}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, i) => {
          if (day == null) return <View key={i} style={styles.cell} />;
          const disabled = isFutureDay(day);
          const selected = isSelectedDay(day);
          return (
            <TouchableOpacity
              key={i}
              style={[styles.cell, selected && styles.cellSelected]}
              disabled={disabled}
              onPress={() => onChange(new Date(viewYear, viewMonth, day))}
            >
              <Text style={[
                styles.cellText,
                disabled && styles.cellTextDisabled,
                selected && styles.cellTextSelected,
              ]}>{day}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2A2A2A',
    marginBottom: 8,
  },
  headerTitleButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4 },
  headerTitle: { color: Colors.cream, fontSize: 15, fontWeight: '700' },
  headerBack: { flexDirection: 'row', alignItems: 'center', minWidth: 60 },
  headerBackText: { color: Colors.cream, fontSize: 14, fontWeight: '600', marginLeft: 2 },
  navButton: { padding: 8, borderRadius: 8 },

  weekdayRow: { flexDirection: 'row', marginBottom: 4 },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    color: Colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  cellSelected: { backgroundColor: Colors.gold },
  cellText: { color: Colors.cream, fontSize: 14, fontWeight: '500' },
  cellTextDisabled: { color: '#4A4A4A' },
  cellTextSelected: { color: Colors.background, fontWeight: '700' },

  yearScroll: { maxHeight: 260 },
  yearGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  yearCell: {
    width: '22%',
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: Colors.surfaceAlt,
  },
  yearCellActive: { backgroundColor: Colors.gold },
  yearCellText: { color: Colors.cream, fontSize: 14, fontWeight: '600' },
  yearCellTextActive: { color: Colors.background, fontWeight: '700' },
});
