import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { useState, useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
const STATS = [
  { label: 'Trips', value: '12' },
  { label: 'Catches', value: '34' },
  { label: 'Km', value: '287' },
  { label: 'Hours', value: '41' },
];

const LOG_TYPES = ['Trip', 'Catch', 'Check-in'];
const CONDITIONS = ['GREAT', 'MIXED', 'ROUGH'];

const AVATAR_COLORS = ['#2E4057', '#5B6C3F', '#7A4E2E', '#4A5D7E', '#6B4E71', '#3F6B5E', '#8A5A44', '#5A4E8A'];

function getAvatarColor(name: string) {
  const letter = name?.[0]?.toUpperCase() || 'B';
  const index = letter.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

const CONDITION_COLORS: Record<string, string> = {
  GREAT: '#166534',
  MIXED: '#92400E',
  ROUGH: '#7F1D1D',
};

export default function ProfileScreen() {
  const [activeLog, setActiveLog] = useState('Trip');
  const [activeCondition, setActiveCondition] = useState('GREAT');
  const [profile, setProfile] = useState<any> (null);
  //fecth user profile when screen loads
  useEffect (() => {
    loadProfile();

  }, []);

  async function loadProfile(){
    const {data: {user} } = await supabase.auth.getUser();
    if (!user) return;

    const {data, error} = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

      if (error){
        console.log(error.message);
      } else {
        setProfile(data);
      }
  }
  const navigation = useNavigation <any>();
  async function handleLogout(){
    await supabase.auth.signOut();
    navigation.navigate('Login');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* User header */}
        <View style={styles.profileHeader}>
          <View style={[styles.avatar, {backgroundColor: getAvatarColor(profile?.first_name) }]}>
            <Text style={styles.avatarText}>{profile?.first_name?.[0] || 'B'}</Text>
          </View>
          <Text style={styles.profileName}>{profile?.first_name || 'Boater'} {profile?.last_name || ''} 
          </Text>
          <Text style={styles.profileSub}>{profile?.region || 'Set your region'}</Text>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          {STATS.map((stat) => (
            <View key={stat.label} style={styles.statCell}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Log activity */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>What are you logging?</Text>
          <View style={styles.logRow}>
            {LOG_TYPES.map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.logTab, activeLog === type && styles.logTabActive]}
                onPress={() => setActiveLog(type)}
              >
                <Text style={[styles.logText, activeLog === type && styles.logTextActive]}>
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Conditions */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>How were the conditions?</Text>
          <View style={styles.conditionRow}>
            {CONDITIONS.map((cond) => (
              <TouchableOpacity
                key={cond}
                style={[
                  styles.conditionTab,
                  activeCondition === cond && { backgroundColor: CONDITION_COLORS[cond], borderColor: CONDITION_COLORS[cond] },
                ]}
                onPress={() => setActiveCondition(cond)}
              >
                <Text style={[styles.conditionText, activeCondition === cond && styles.conditionTextActive]}>
                  {cond}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Post button */}
        <TouchableOpacity style={styles.postButton}>
          <Text style={styles.postButtonText}>Post to Dock Feed</Text>
        </TouchableOpacity>

        <TouchableOpacity style ={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 48,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#2E4057',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    color: Colors.cream,
    fontSize: 28,
    fontWeight: 'bold',
  },
  profileName: {
    color: Colors.cream,
    fontSize: 22,
    fontWeight: 'bold',
  },
  profileSub: {
    color: '#8899AA',
    fontSize: 13,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#0F0F0F',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E1E1E',
    marginBottom: 16,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
  },
  statValue: {
    color: Colors.gold,
    fontSize: 22,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#8899AA',
    fontSize: 12,
    marginTop: 2,
  },
  card: {
    backgroundColor: '#0F0F0F',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E1E1E',
  },
  cardTitle: {
    color: Colors.cream,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 14,
  },
  logRow: {
    flexDirection: 'row',
    gap: 8,
  },
  logTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2E4057',
    alignItems: 'center',
  },
  logTabActive: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  logText: {
    color: '#8899AA',
    fontSize: 13,
  },
  logTextActive: {
    color: Colors.black,
    fontWeight: '700',
  },
  conditionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  conditionTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2E4057',
    alignItems: 'center',
  },
  conditionText: {
    color: '#8899AA',
    fontSize: 12,
    fontWeight: '600',
  },
  conditionTextActive: {
    color: Colors.white,
  },
  postButton: {
    backgroundColor: Colors.gold,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  postButtonText: {
    color: Colors.black,
    fontSize: 16,
    fontWeight: '700',
  },
  logoutButton: {
  marginTop: 16,
  padding: 16,
  borderRadius: 12,
  alignItems: 'center',
  borderWidth: 1,
  borderColor: '#FF4444',
},
logoutButtonText: {
  color: '#FF4444',
  fontSize: 16,
  fontWeight: '700',
},
});