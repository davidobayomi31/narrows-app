
import { View, Text, StyleSheet, ScrollView, TouchableOpacity,  } from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useState} from 'react';
import {Colors} from '../constants/colors';

const FILTER = ['All', 'Trips', 'Catches','Check-ins']

//Decide late if i want to leave this or let posts fill up by its self(have to use data basse)
const POST = [
  {
    id:'1',
    initial: 'M',
    //initial is for "profle picture, later let users acutally add prifle picture"
    name: 'Mike Tanner',
    time:'2hs ago',
    location: 'Orillia, ON',
    type: 'Trip',
    text: 'Great run up to Sparrow Lake today. Calm waters all the way through the Narrows'
    //later change 'text' to 'caption'
},
{
  id: '2',
  initial: 'S',
  name: 'Sarah K',
  time: '5h ago',
  locaiton: 'Barrie, ON',
  type:'Catch',
  text: 'Landed a 4lb bass off the dock at Big Bay Point. Water temp was perfect.',
},
{
  id: '3',
  initial: 'R',
  name: 'Rob Deleany',
  time: '1 Day ago',
  locaiton: 'Rama, ON',
  type:'Trip',
  text: 'Had an asome trip on the Narrows, got discount gas at Blue Beacon Marina',
  
},
{
  id: '',
  initial: '',
  name: '',
  time: '',
  locaiton: '',
  type:'',
  text: '',
  
},
{
  id: '',
  initial: '',
  name: '',
  time: '',
  locaiton: '',
  type:'',
  text: '',
  
},
];

const BADGE_COLORS: Record<string, string> = {
  TRIP:'#1B4FD8',
  CATCH:'#166534',
  CHECK:'#92400E',
};

export default function FeedScreen () {
  const [activeFilter, setActiveFilter] = useState ('ALL');
  
  return (
    <SafeAreaView style = {styles.safeArea}>
      {/* filter tab */}
      <View style = {styles.filterRow}>
        {FILTER.map((f) => (
          <TouchableOpacity
            key = {f}
            style = {[styles.filterTab, activeFilter === f && styles.filterActiveTab]}
            onPress = {() => setActiveFilter (f)}
            >
              <Text style ={[styles.filterText, activeFilter == f && styles.filterActiveText]}>
                {f}
              </Text>
          </TouchableOpacity>
        ))}

      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {POST.map((post) => (
          <View key={post.id} style={styles.card}>
            {/* Ttop row: avatar + name/time + badge */}
            <View  style = {styles.cardHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{post.initial}</Text>
              </View>
              <View style={[styles.badge, {backgroundColor: BADGE_COLORS[post.tpye] }]}>
                <text style={styles.badgeText}>{post.type}</text>
              </View>
            </View>
            {/* Post text */}
            <Text style={styles.cardText}>{post.text}</Text>

            {/* Anchor like button */}
            <TouchableOpacity style={styles.anchorButton}>
              <Text style={styles.anchorText}>⚓</Text>
            </TouchableOpacity>
          </View>
        ) )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 16,
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
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 48,
  },
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
});
