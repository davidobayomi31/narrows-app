import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Colors } from '../../constants/colors';
import Homepage from '../Homepage';
import FeedScreen from '../FeedScreen';
import MapScreen from '../MapScreen';
import ProfileScreen from '../ProfileScreen';

const Tab = createBottomTabNavigator();

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.gold,
        tabBarInactiveTintColor: '#8E8E93',
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        // frosted background: the page blurs THROUGH the bar (Uber/Wealthsimple look)
        tabBarBackground: () => (
          <BlurView
            intensity={40}
            tint="dark"
            style={{ flex: 1, borderRadius: 28, overflow: 'hidden' }}
          />
        ),
        // floating pill, detached from the bottom edge, translucent
        tabBarStyle: {
          position: 'absolute',
          left: 20,
          right: 20,
          bottom: 28,
          height: 62,
          borderRadius: 28,
          backgroundColor: 'rgba(28,28,30,0.55)', // tint under the blur; semi-transparent
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
          paddingHorizontal: 8,
          paddingTop: 8,
          paddingBottom: 8,
          overflow: 'hidden',
          elevation: 0,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={Homepage}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Feed"
        component={FeedScreen}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name="newspaper-outline" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name="map-outline" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} /> }}
      />
    </Tab.Navigator>
  );
}
