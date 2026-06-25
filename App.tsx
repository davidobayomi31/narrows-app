import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import MainTabs from './screens/navigation/MainTabs';
import LoginScreen from './screens/LoginScreen';
import SplashScreen from './screens/SplashScreen';
import SignupScreen from './screens/SignupScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import ConfirmEmailScreen from './screens/ConfirmEmailScreen';
import ExploreScreen from './screens/ExploreScreen';
import SettingsScreen from './screens/SettingsScreen';
import EditProfileScreen from './screens/EditProfileScreen';
import { Colors } from './constants/colors';

const Stack = createNativeStackNavigator();

export default function App(){
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName='Splash'
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name='Splash' component={SplashScreen} />
        <Stack.Screen name='Login' component={LoginScreen} />
        <Stack.Screen name='Signup' component={SignupScreen} />
        <Stack.Screen name='Home' component={MainTabs} />
        <Stack.Screen name='Onboarding' component={OnboardingScreen} />
        <Stack.Screen name='ConfirmEmail' component={ConfirmEmailScreen} />
        <Stack.Screen
          name ='Explore'
          component={ExploreScreen}
          options={{
            headerShown: true,
            title: 'Explore',
            headerStyle: { backgroundColor: Colors.background },
            headerTintColor: Colors.cream,
          }}
          />
        <Stack.Screen
          name='Settings'
          component={SettingsScreen}
          options={{
            headerShown: true,
            title: 'Settings',
            headerStyle: { backgroundColor: Colors.background },
            headerTintColor: Colors.cream,
          }}
        />
        <Stack.Screen
          name='EditProfile'
          component={EditProfileScreen}
          options={{
            headerShown: true,
            title: 'Edit Profile',
            headerStyle: { backgroundColor: Colors.background },
            headerTintColor: Colors.cream,
          }}
         />
      </Stack.Navigator>
    </NavigationContainer>
  );
}