import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { BOOKING_REQUESTS_LIVE } from '../constants/features';
import { supabase } from '../lib/supabase';
import { useUnits } from '../contexts/UnitsContext';
import { useAccount } from '../contexts/AccountContext';
import { friendlyError } from '../lib/errors';
import { PRIVACY_URL, TERMS_URL, COMMUNITY_GUIDELINES_URL } from '../constants/legal';

// a small two-option segmented control used for the unit toggles
function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
            onPress={() => onChange(opt.value)}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function Row({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <Ionicons name={icon} size={20} color={danger ? '#FF4444' : Colors.cream} />
      <Text style={[styles.rowLabel, danger && { color: '#FF4444' }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={Colors.muted} />
    </TouchableOpacity>
  );
}

// A setup-checklist row — like Row, but for an outstanding onboarding step
// rather than a settings destination. The amber dot mirrors the pending-review
// banner styling used elsewhere so it reads as "needs attention" at a glance.
function SetupRow({
  icon,
  label,
  subtitle,
  onPress,
  busy,
}: {
  icon: any;
  label: string;
  subtitle: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} disabled={busy}>
      <View style={styles.setupDot} />
      <Ionicons name={icon} size={20} color={Colors.cream} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{busy ? 'Working…' : label}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.muted} />
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const { accountType, marina: ownedMarina } = useAccount();
  const {
    distanceUnit,
    timeUnit,
    speedUnit,
    depthMode,
    shallowAlertEnabled,
    shallowAlertDepthM,
    setDistanceUnit,
    setTimeUnit,
    setSpeedUnit,
    setDepthMode,
    setShallowAlertEnabled,
    setShallowAlertDepthM,
  } = useUnits();

  // Marina onboarding checklist — only outstanding steps are shown, and the
  // whole section disappears once everything's done. Currently checks:
  //  1. Stripe Connect (boaters can't pay a deposit without it — same check
  //     Homepage.tsx's banner uses).
  //  2. Listing prices — auto-provisioned listings start with a null price
  //     ("contact for pricing"); a marina that never sets one can't actually
  //     get booked for anything with a real cost.
  const [connectingStripe, setConnectingStripe] = useState(false);
  const [unpricedListings, setUnpricedListings] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (accountType !== 'marina' || !ownedMarina) return;
      supabase
        .from('marina_listings')
        .select('id', { count: 'exact', head: true })
        .eq('marina_id', ownedMarina.id)
        .eq('active', true)
        .is('price_cents', null)
        .then(({ count }) => setUnpricedListings(count ?? 0));
    }, [accountType, ownedMarina])
  );

  async function connectStripe() {
    setConnectingStripe(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-connected-account');
      if (error || !data?.url) {
        throw new Error(error?.message || 'Could not start Stripe setup');
      }
      await Linking.openURL(data.url);
    } catch (err) {
      Alert.alert('Could not connect Stripe', friendlyError(err as Error));
    } finally {
      setConnectingStripe(false);
    }
  }

  const setupStepsRemaining =
    accountType === 'marina' && ownedMarina
      ? (!ownedMarina.stripe_charges_enabled ? 1 : 0) + (unpricedListings > 0 ? 1 : 0)
      : 0;

  // show the alert threshold in the user's chosen depth unit (ft with miles, m with km)
  const thresholdLabel =
    distanceUnit === 'mi'
      ? `${Math.round(shallowAlertDepthM * 3.28084)} ft`
      : `${shallowAlertDepthM.toFixed(1)} m`;

  function logOut() {
    Alert.alert(
      'Log out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            await supabase.auth.signOut();
            // reset so Login is the single root — otherwise the next sign-in
            // pushes a second Main behind this Settings and navigation breaks.
            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
          },
        },
      ]
    );
  }

  // Apple Guideline 5.1.1(v): account creation requires in-app deletion of the
  // account AND its data. Calls the `delete-account` Edge Function, which uses
  // the service role server-side to remove the auth user (cascades their rows).
  function deleteAccount() {
    Alert.alert(
      'Delete account',
      'This permanently deletes your account, profile, posts, comments, and catch pins. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // second confirmation — destructive + irreversible
            Alert.alert(
              'Are you absolutely sure?',
              'There is no way to recover your account after this.',
              [
                { text: 'Keep my account', style: 'cancel' },
                {
                  text: 'Delete forever',
                  style: 'destructive',
                  onPress: async () => {
                    const { error } = await supabase.functions.invoke('delete-account');
                    if (error) {
                      Alert.alert(
                        'Could not delete account',
                        'Something went wrong. Please try again or email support@narrows.site.'
                      );
                      return;
                    }
                    await supabase.auth.signOut();
                    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.section}>ACCOUNT</Text>
      <View style={styles.group}>
        <Row icon="person-outline" label="Edit Profile" onPress={() => navigation.navigate('EditProfile')} />
      </View>

      {setupStepsRemaining > 0 && (
        <>
          <Text style={styles.section}>FINISH SETTING UP</Text>
          <View style={styles.group}>
            {!ownedMarina!.stripe_charges_enabled && (
              <SetupRow
                icon="card-outline"
                label="Connect with Stripe"
                subtitle="Required before boaters can pay you a deposit."
                onPress={connectStripe}
                busy={connectingStripe}
              />
            )}
            {unpricedListings > 0 && (
              <SetupRow
                icon="pricetag-outline"
                label="Set your prices"
                subtitle={`${unpricedListings} listing${unpricedListings === 1 ? '' : 's'} still show "contact for pricing." Set prices on narrows.site.`}
                // No in-app price editor yet — that's the web portal's job
                // (narrows-landing/marina/listings.html).
                onPress={() => Linking.openURL('https://narrows.site/marina/listings.html')}
              />
            )}
          </View>
        </>
      )}

      {BOOKING_REQUESTS_LIVE && (
        <>
          <Text style={styles.section}>REQUESTS</Text>
          <View style={styles.group}>
            <Row
              icon="document-text-outline"
              label="My Requests"
              onPress={() => navigation.navigate('MyRequests')}
            />
          </View>
        </>
      )}

      <Text style={styles.section}>UNITS</Text>
      <View style={styles.group}>
        <View style={styles.unitRow}>
          <Text style={styles.rowLabel}>Distance</Text>
          <Segmented
            value={distanceUnit}
            onChange={setDistanceUnit}
            options={[
              { label: 'Km', value: 'km' },
              { label: 'Miles', value: 'mi' },
            ]}
          />
        </View>
        <View style={styles.unitRow}>
          <Text style={styles.rowLabel}>Trip time</Text>
          <Segmented
            value={timeUnit}
            onChange={setTimeUnit}
            options={[
              { label: 'Hours', value: 'hours' },
              { label: 'Minutes', value: 'minutes' },
            ]}
          />
        </View>
        <View style={styles.unitRow}>
          <Text style={styles.rowLabel}>Speed</Text>
          <Segmented
            value={speedUnit}
            onChange={setSpeedUnit}
            options={[
              { label: 'km/h', value: 'kmh' },
              { label: 'mph', value: 'mph' },
              { label: 'kn', value: 'kn' },
            ]}
          />
        </View>
      </View>

      <Text style={styles.section}>MAP</Text>
      <View style={styles.group}>
        <View style={styles.unitRow}>
          <Text style={styles.rowLabel}>Depth</Text>
          <Segmented
            value={depthMode}
            onChange={setDepthMode}
            options={[
              { label: 'My location', value: 'location' },
              { label: 'Map center', value: 'map' },
            ]}
          />
        </View>
        <View style={styles.unitRow}>
          <Text style={styles.rowLabel}>Shallow alert</Text>
          <Segmented
            value={shallowAlertEnabled ? 'on' : 'off'}
            onChange={(v) => setShallowAlertEnabled(v === 'on')}
            options={[
              { label: 'Off', value: 'off' },
              { label: 'On', value: 'on' },
            ]}
          />
        </View>
        {shallowAlertEnabled && (
          <View style={styles.unitRow}>
            <Text style={styles.rowLabel}>Warn under</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setShallowAlertDepthM(shallowAlertDepthM - 0.3)}
              >
                <Ionicons name="remove" size={18} color={Colors.cream} />
              </TouchableOpacity>
              <Text style={styles.stepValue}>{thresholdLabel}</Text>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setShallowAlertDepthM(shallowAlertDepthM + 0.3)}
              >
                <Ionicons name="add" size={18} color={Colors.cream} />
              </TouchableOpacity>
            </View>
          </View>
        )}
        <Row icon="cloud-offline-outline" label="Offline Maps" onPress={() => navigation.navigate('OfflineMaps')} />
      </View>

      <Text style={styles.section}>TRIPS</Text>
      <View style={styles.group}>
        <Row icon="navigate-outline" label="My Trips" onPress={() => navigation.navigate('Trips')} />
      </View>

      <Text style={styles.section}>LEGAL</Text>
      <View style={styles.group}>
        <Row icon="shield-outline" label="Privacy Policy" onPress={() => Linking.openURL(PRIVACY_URL)} />
        <Row icon="document-text-outline" label="Terms of Service" onPress={() => Linking.openURL(TERMS_URL)} />
        <Row icon="people-outline" label="Community Guidelines" onPress={() => Linking.openURL(COMMUNITY_GUIDELINES_URL)} />
      </View>

      <Text style={styles.section}>ACCOUNT ACTIONS</Text>
      <View style={styles.group}>
        <Row icon="log-out-outline" label="Log Out" onPress={logOut} />
        <Row icon="trash-outline" label="Delete Account" onPress={deleteAccount} danger />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, paddingBottom: 60 },
  section: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  group: { backgroundColor: Colors.surface, borderRadius: 16, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rowLabel: { flex: 1, color: Colors.cream, fontSize: 16 },
  rowSubtitle: { color: Colors.muted, fontSize: 12, marginTop: 2 },
  setupDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.gold },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 10,
    padding: 2,
  },
  segmentItem: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  segmentItemActive: { backgroundColor: Colors.gold },
  segmentText: { color: Colors.muted, fontSize: 13, fontWeight: '600' },
  segmentTextActive: { color: Colors.black, fontWeight: '700' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 10,
    padding: 2,
  },
  stepBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  stepValue: {
    color: Colors.cream,
    fontSize: 14,
    fontWeight: '700',
    minWidth: 52,
    textAlign: 'center',
  },
});