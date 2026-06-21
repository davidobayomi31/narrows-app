import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { Colors } from '../constants/colors';
import { supabase } from '../lib/supabase';

const FILTER = ['All', 'Trips', 'Catches', 'Check-ins'];
const LOG_TYPES = ['Trip', 'Catch', 'Check-in'];
const CONDITIONS = ['GREAT', 'MIXED', 'ROUGH'];
const SPECIES = ['Bass', 'Pike', 'Walleye', 'Perch', 'Musky', 'Trout', 'Other'];

// converts the composer label to the code stored in the database
const TYPE_MAP: Record<string, string> = {
  Trip: 'TRIP',
  Catch: 'CATCH',
  'Check-in': 'CHECK',
};

// which post type each filter tab shows ('All' shows everything)
const FILTER_TYPE: Record<string, string> = {
  Trips: 'TRIP',
  Catches: 'CATCH',
  'Check-ins': 'CHECK',
};

const BADGE_COLORS: Record<string, string> = {
  TRIP: '#1B4FD8',
  CATCH: '#166534',
  CHECK: '#92400E',
};

const CONDITION_COLORS: Record<string, string> = {
  GREAT: '#166534',
  MIXED: '#92400E',
  ROUGH: '#7F1D1D',
};

const AVATAR_COLORS = ['#2E4057', '#5B6C3F', '#7A4E2E', '#4A5D7E', '#6B4E71', '#3F6B5E', '#8A5A44', '#5A4E8A'];

function getAvatarColor(name: string) {
  const letter = name?.[0]?.toUpperCase() || 'B';
  return AVATAR_COLORS[letter.charCodeAt(0) % AVATAR_COLORS.length];
}

// turns a timestamp into "5m ago", "3h ago", "2d ago"
function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function FeedScreen() {
  const [activeFilter, setActiveFilter] = useState('All');
  const [posts, setPosts] = useState<any[]>([]);

  // composer
  const [showComposer, setShowComposer] = useState(false);
  const [activeLog, setActiveLog] = useState('Trip');
  const [activeCondition, setActiveCondition] = useState('GREAT');
  const [caption, setCaption] = useState('');

  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [location, setLocation] = useState('');
  const [species, setSpecies] = useState('');
  const [weight, setWeight] = useState('');
  const [length, setLength] = useState('');
  const [released, setReleased] = useState(false);

  useEffect(() => {
    loadPosts();
  }, []);

  async function loadPosts() {
    // 1. all posts, newest first
    const { data: postsData, error } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.log(error.message);
      return;
    }

    // 2. all profiles (to get each author's name)
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, region');

    // 3. attach the matching profile to each post
    const merged = (postsData || []).map((post) => ({
      ...post,
      author: profilesData?.find((p) => p.id === post.user_id),
    }));

    setPosts(merged);
  }

  async function handlePost() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (caption.trim().length === 0) {
      alert('Add a caption before posting');
      return;
    }

    const { error } = await supabase.from('posts').insert({
      user_id: user.id,
      type: TYPE_MAP[activeLog],
      conditions: activeLog === 'Trip' ? activeCondition : null,
      caption: caption,
      location: location || null,
      duration_hours: duration ? Number(duration) : null,
      distance_km: distance ? Number(distance) : null,
      species: species || null,
      weight_lbs: weight ? Number(weight) : null,
      length_in: length ? Number(length) : null,
      released: activeLog === 'Catch' ? released : null,
    });

    if (error) {
      alert(error.message);
    } else {
      setCaption('');
      setDuration('');
      setDistance('');
      setLocation('');
      setSpecies('');
      setWeight('');
      setLength('');
      setReleased(false);
      setShowComposer(false);
      loadPosts();
    }
  }

  // only show posts matching the active filter
  const visiblePosts =
    activeFilter === 'All'
      ? posts
      : posts.filter((p) => p.type === FILTER_TYPE[activeFilter]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Filter tabs */}
        <View style={styles.filterRow}>
          {FILTER.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterTab, activeFilter === f && styles.filterTabActive]}
              onPress={() => setActiveFilter(f)}
            >
              <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Posts */}
        {visiblePosts.map((post) => {
          const name = `${post.author?.first_name || 'Boater'} ${post.author?.last_name || ''}`;
          return (
            <View key={post.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.avatar, { backgroundColor: getAvatarColor(post.author?.first_name) }]}>
                  <Text style={styles.avatarText}>{post.author?.first_name?.[0] || 'B'}</Text>
                </View>
                <View style={styles.cardMeta}>
                  <Text style={styles.cardName}>{name}</Text>
                  <Text style={styles.cardSub}>
                    {timeAgo(post.created_at)} · {post.author?.region || ''}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: BADGE_COLORS[post.type] }]}>
                  <Text style={styles.badgeText}>{post.type}</Text>
                </View>
              </View>
              <Text style={styles.cardText}>{post.caption}</Text>
              <TouchableOpacity style={styles.anchorButton}>
                <Text style={styles.anchorText}>⚓</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>

      {/* Floating + button */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowComposer(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Composer modal */}
      <Modal
        visible={showComposer}
        animationType="slide"
        transparent
        onRequestClose={() => setShowComposer(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>New Post</Text>
                <TouchableOpacity onPress={() => setShowComposer(false)}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.cardTitle}>What are you logging?</Text>
              <View style={styles.row}>
                {LOG_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.tab, activeLog === type && styles.tabActive]}
                    onPress={() => setActiveLog(type)}
                  >
                    <Text style={[styles.tabText, activeLog === type && styles.tabTextActive]}>
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Trip fields */}
              {activeLog === 'Trip' && (
                <>
                  <Text style={[styles.cardTitle, { marginTop: 16 }]}>How were the conditions?</Text>
                  <View style={styles.row}>
                    {CONDITIONS.map((cond) => (
                      <TouchableOpacity
                        key={cond}
                        style={[styles.tab, activeCondition === cond && { backgroundColor: CONDITION_COLORS[cond], borderColor: CONDITION_COLORS[cond] }]}
                        onPress={() => setActiveCondition(cond)}
                      >
                        <Text style={[styles.tabText, activeCondition === cond && { color: Colors.white }]}>{cond}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput style={styles.fieldInput} placeholder="Duration (hours)" placeholderTextColor="#8899AA" keyboardType="numeric" value={duration} onChangeText={setDuration} />
                  <TextInput style={styles.fieldInput} placeholder="Distance (km)" placeholderTextColor="#8899AA" keyboardType="numeric" value={distance} onChangeText={setDistance} />
                  <TextInput style={styles.fieldInput} placeholder="Where? (e.g. Narrows to Sparrow Lake)" placeholderTextColor="#8899AA" value={location} onChangeText={setLocation} />
                </>
              )}

              {/* Catch fields */}
              {activeLog === 'Catch' && (
                <>
                  <Text style={[styles.cardTitle, { marginTop: 16 }]}>Species</Text>
                  <View style={styles.wrapRow}>
                    {SPECIES.map((s) => (
                      <TouchableOpacity
                        key={s}
                        style={[styles.pill, species === s && styles.tabActive]}
                        onPress={() => setSpecies(s)}
                      >
                        <Text style={[styles.tabText, species === s && styles.tabTextActive]}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput style={styles.fieldInput} placeholder="Weight (lbs)" placeholderTextColor="#8899AA" keyboardType="numeric" value={weight} onChangeText={setWeight} />
                  <TextInput style={styles.fieldInput} placeholder="Length (inches)" placeholderTextColor="#8899AA" keyboardType="numeric" value={length} onChangeText={setLength} />
                  <TextInput style={styles.fieldInput} placeholder="Spot (where you caught it)" placeholderTextColor="#8899AA" value={location} onChangeText={setLocation} />
                  <TouchableOpacity style={[styles.releaseToggle, released && styles.tabActive]} onPress={() => setReleased(!released)}>
                    <Text style={[styles.tabText, released && styles.tabTextActive]}>{released ? '✓ Released' : 'Released?'}</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Check-in fields */}
              {activeLog === 'Check-in' && (
                <TextInput style={[styles.fieldInput, { marginTop: 16 }]} placeholder="Where are you? (marina / location)" placeholderTextColor="#8899AA" value={location} onChangeText={setLocation} />
              )}



              <TextInput
                style={styles.captionInput}
                placeholder="Say something about it..."
                placeholderTextColor="#8899AA"
                value={caption}
                onChangeText={setCaption}
                multiline
              />

              <TouchableOpacity style={styles.postButton} onPress={handlePost}>
                <Text style={styles.postButtonText}>Post to Dock Feed</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
    paddingTop: 12,
    paddingBottom: 96,
  },

  // filter tabs
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2E4057',
  },
  filterTabActive: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  filterText: {
    color: '#8899AA',
    fontSize: 13,
  },
  filterTextActive: {
    color: Colors.black,
    fontWeight: '700',
  },

  // post cards
  card: {
    backgroundColor: '#0F0F0F',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E1E1E',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2E4057',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    color: Colors.cream,
    fontWeight: 'bold',
    fontSize: 16,
  },
  cardMeta: {
    flex: 1,
  },
  cardName: {
    color: Colors.cream,
    fontWeight: '600',
    fontSize: 14,
  },
  cardSub: {
    color: '#8899AA',
    fontSize: 12,
    marginTop: 2,
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
  cardText: {
    color: '#8899AA',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  anchorButton: {
    alignSelf: 'flex-end',
  },
  anchorText: {
    fontSize: 20,
  },

  // floating action button
  fab: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  fabText: {
    color: Colors.black,
    fontSize: 34,
    fontWeight: '700',
    marginTop: -2,
  },

  // modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#0F0F0F',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: '#1E1E1E',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: Colors.cream,
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalClose: {
    color: '#8899AA',
    fontSize: 20,
  },

  // composer (shared)
  cardTitle: {
    color: Colors.cream,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2E4057',
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  tabText: {
    color: '#8899AA',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: Colors.black,
    fontWeight: '700',
  },
  captionInput: {
    backgroundColor: '#1A1A1A',
    color: Colors.cream,
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    minHeight: 60,
    marginTop: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333333',
  },
  fieldInput: {
  backgroundColor: '#1A1A1A',
  color: Colors.cream,
  borderRadius: 12,
  padding: 14,
  fontSize: 15,
  marginTop: 12,
  borderWidth: 1,
  borderColor: '#333333',
},
wrapRow: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 8,
},
pill: {
  paddingHorizontal: 14,
  paddingVertical: 8,
  borderRadius: 20,
  borderWidth: 1,
  borderColor: '#2E4057',
},
releaseToggle: {
  marginTop: 12,
  paddingVertical: 10,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: '#2E4057',
  alignItems: 'center',
},
  postButton: {
    backgroundColor: Colors.gold,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  postButtonText: {
    color: Colors.black,
    fontSize: 15,
    fontWeight: '700',
  },
});
