import {NavigationContainer, createNavigationContainerRef} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';

import MainTabs from './screens/navigation/MainTabs';
import LoginScreen from './screens/LoginScreen';
import SplashScreen from './screens/SplashScreen';
import SignupScreen from './screens/SignupScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import AccountTypeScreen from './screens/AccountTypeScreen';
import MarinaOnboardingScreen from './screens/MarinaOnboardingScreen';
import ConfirmEmailScreen from './screens/ConfirmEmailScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import SetNewPasswordScreen from './screens/SetNewPasswordScreen';
import SettingsScreen from './screens/SettingsScreen';
import EditProfileScreen from './screens/EditProfileScreen';
import EventsScreen from './screens/EventsScreen';
import MarinaProfileScreen from './screens/MarinaProfileScreen';
import MarinaServicesScreen from './screens/MarinaServicesScreen';
import MyRequestsScreen from './screens/MyRequestsScreen';
import MarinaMessagesScreen from './screens/MarinaMessagesScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import PostDetailScreen from './screens/PostDetailScreen';
import TripsScreen from './screens/TripsScreen';
import TripDetailScreen from './screens/TripDetailScreen';
import OfflineMapsScreen from './screens/OfflineMapsScreen';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from './constants/colors';
import { TripProvider } from './contexts/TripContext';
import { UnitsProvider } from './contexts/UnitsContext';
import { AccountProvider } from './contexts/AccountContext';
import { registerForPushNotifications } from './lib/pushNotifications';
import { supabase } from './lib/supabase';
import ErrorBoundary from './screens/components/ErrorBoundary';
import { logError } from './lib/logError';
import { StripeProvider } from '@stripe/stripe-react-native';
import { STRIPE_PUBLISHABLE_KEY } from './constants/stripe';

const Stack = createNativeStackNavigator();
// lets us navigate from outside React components (e.g. a push notification tap)
export const navigationRef = createNavigationContainerRef<any>();

// Universal Links: tapping https://narrows.site/post/<id> (or narrows://post/<id>)
// opens the app straight to that post. Falls back to the narrows.site teaser page
// when the app isn't installed.
const linking = {
  prefixes: ['https://narrows.site', 'https://www.narrows.site', 'narrows://'],
  config: {
    screens: {
      PostDetail: 'post/:postId',
    },
  },
};

export default function App(){
  useEffect(() => {
    // Global safety net for errors thrown outside React's render tree — an
    // uncaught exception or an unhandled promise rejection. Reports them so a
    // background crash still triggers an alert. (React render crashes are
    // caught by <ErrorBoundary> below.)
    const globalAny = global as any;
    const prevHandler = globalAny.ErrorUtils?.getGlobalHandler?.();
    globalAny.ErrorUtils?.setGlobalHandler?.((error: any, isFatal?: boolean) => {
      logError(error, { source: 'global', extra: { isFatal: !!isFatal } });
      prevHandler?.(error, isFatal);
    });

    // register this device for push whenever a user is signed in
    registerForPushNotifications();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        registerForPushNotifications();
        // remember we've been signed in, so an OFFLINE reopen (where token
        // refresh can't reach the server) still lets Splash into the app.
        AsyncStorage.setItem('narrows.signedIn', '1').catch(() => {});
      }
      if (event === 'SIGNED_OUT') {
        AsyncStorage.removeItem('narrows.signedIn').catch(() => {});
      }
    });

    // tapping a push notification jumps to the relevant post (same as in-app)
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as any;
      if (data?.postId && navigationRef.isReady()) {
        navigationRef.navigate('Main', {
          screen: 'Feed',
          params: { focusPostId: data.postId, focusType: data.type, focusNonce: Date.now() },
        });
      }
    });

    return () => {
      sub.subscription.unsubscribe();
      tapSub.remove();
    };
  }, []);

  return (
    <ErrorBoundary>
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} merchantIdentifier="merchant.site.narrows.app">
    <UnitsProvider>
    <AccountProvider>
    <TripProvider>
    <NavigationContainer ref={navigationRef} linking={linking}>
      <StatusBar style="light" />
      <Stack.Navigator
        initialRouteName='Splash'
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name='Splash' component={SplashScreen} />
        <Stack.Screen name='Login' component={LoginScreen} />
        <Stack.Screen name='Signup' component={SignupScreen} />
        <Stack.Screen name='Main' component={MainTabs} />
        <Stack.Screen name='Onboarding' component={OnboardingScreen} />
        <Stack.Screen name='AccountType' component={AccountTypeScreen} />
        <Stack.Screen name='MarinaOnboarding' component={MarinaOnboardingScreen} />
        <Stack.Screen name='ConfirmEmail' component={ConfirmEmailScreen} />
        <Stack.Screen name='ForgotPassword' component={ForgotPasswordScreen} />
        <Stack.Screen name='ResetPassword' component={ResetPasswordScreen} />
        <Stack.Screen name='SetNewPassword' component={SetNewPasswordScreen} />
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
        <Stack.Screen
          name='Events'
          component={EventsScreen}
          options={{
            headerShown: true,
            title: 'Events',
            headerStyle: { backgroundColor: Colors.background },
            headerTintColor: Colors.cream,
          }}
        />
        <Stack.Screen name='MarinaProfile' component={MarinaProfileScreen} />
        <Stack.Screen name='MarinaServices' component={MarinaServicesScreen} />
        <Stack.Screen name='MarinaMessages' component={MarinaMessagesScreen} />
        <Stack.Screen
          name='MyRequests'
          component={MyRequestsScreen}
          options={{
            headerShown: true,
            title: 'My Requests',
            headerStyle: { backgroundColor: Colors.background },
            headerTintColor: Colors.cream,
          }}
        />
        <Stack.Screen name='Notifications' component={NotificationsScreen} />
        <Stack.Screen name='PostDetail' component={PostDetailScreen} />
        <Stack.Screen
          name='Trips'
          component={TripsScreen}
          options={{
            headerShown: true,
            title: 'My Trips',
            headerStyle: { backgroundColor: Colors.background },
            headerTintColor: Colors.cream,
          }}
        />
        <Stack.Screen name='TripDetail' component={TripDetailScreen} />
        <Stack.Screen
          name='OfflineMaps'
          component={OfflineMapsScreen}
          options={{
            headerShown: true,
            title: 'Offline Maps',
            headerStyle: { backgroundColor: Colors.background },
            headerTintColor: Colors.cream,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
    </TripProvider>
    </AccountProvider>
    </UnitsProvider>
    </StripeProvider>
    </ErrorBoundary>
  );
}