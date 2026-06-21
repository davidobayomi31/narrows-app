import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { supabase } from '../lib/supabase';

const STATS = [
  { label: 'Trips', value: '12' },
  { label: 'Catches', value: '34' },
  { label: 'Km', value: '287' },
  { label: 'Hours', value: '41' },
];

const BADGE_COLORS: Record<string, string> = {
  TRIP: '#1B4FD8',
  CATCH: '#166534',
  CHECK: '#92400E',
};

const AVATAR_COLORS = ['#2E4057', '#5B6C3F', '#7A4E2E', '#4A5D7E', '#6B4E71', '#3F6B5E', '#8A5A44', '#5A4E8A'];

function getAvatarColor(name: string) {
  const letter = name?.[0]?.toUpperCase() || 'B';
  return AVATAR_COLORS[letter.charCodeAt(0) % AVATAR_COLORS.length];
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const [profile, setProfile] = useState<any>(null);
  const [myPosts, setMyPosts] = useState<any[]>([]);

  useEffect(() => {
    loadProfile();
    loadMyPosts();
  }, []);

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      console.log(error.message);
    } else {
      setProfile(data);
    }
  }

  async function loadMyPosts() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // only this user's own posts, newest first
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.log(error.message);
    } else {
      setMyPosts(data || []);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigation.navigate('Login');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* User header */}
        <View style={styles.profileHeader}>
          <View style={[styles.avatar, { backgroundColor: getAvatarColor(profile?.first_name) }]}>
            <Text style={styles.avatarText}>{profile?.first_name?.[0] || 'B'}</Text>
          </View>
          <Text style={styles.profileName}>
            {profile?.first_name || 'Boater'} {profile?.last_name || ''}
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

        {/* Your posts */}
        <Text style={styles.sectionTitle}>Your Posts</Text>
        {myPosts.length === 0 ? (
          <Text style={styles.emptyText}>You haven't posted anything yet.</Text>
        ) : (
          myPosts.map((post) => (
            <View key={post.id} style={styles.card}>
              <View style={styles.postHeader}>
                <View style={[styles.badge, { backgroundColor: BADGE_COLORS[post.type] }]}>
                  <Text style={styles.badgeText}>{post.type}</Text>
                </View>
                <Text style={styles.postTime}>{timeAgo(post.created_at)}</Text>
              </View>
              <Text style={styles.postCaption}>{post.caption}</Text>
            </View>
          ))
        )}

        {/* Log out */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
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
    marginBottom: 24,
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
  sectionTitle: {
    color: Colors.cream,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  emptyText: {
    color: '#8899AA',
    fontSize: 14,
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#0F0F0F',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E1E1E',
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  postTime: {
    color: '#8899AA',
    fontSize: 12,
  },
  postCaption: {
    color: '#8899AA',
    fontSize: 14,
    lineHeight: 20,
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
