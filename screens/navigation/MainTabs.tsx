import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Homepage from '../Homepage';
import FeedScreen from '../FeedScreen';
import MapScreen from '../MapScreen';
import ExploreScreen from '../ExploreScreen';
import ProfileScreen from '../ProfileScreen';

const Tab = createBottomTabNavigator();

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0D0D0D',
          borderTopColor: '#2E4057',
        },
        tabBarActiveTintColor: '#C9A84C',
        tabBarInactiveTintColor: '#8899AA',
      }}
    >
      <Tab.Screen name="Home" component={Homepage} />
      <Tab.Screen name="Feed" component={FeedScreen} />
      <Tab.Screen name="Map" component={MapScreen} />
      <Tab.Screen name="Explore" component={ExploreScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
