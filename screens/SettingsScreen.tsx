import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { supabase } from '../lib/supabase';
import { PRIVACY_URL, TERMS_URL, COMMUNITY_GUIDELINES_URL } from '../constants/legal';

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

export default function SettingsScreen() {
  const navigation = useNavigation<any>();

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
            navigation.navigate('Login');
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
                    navigation.navigate('Login');
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
});