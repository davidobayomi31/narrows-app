import { Alert } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';

// Runs the native Sign in with Apple flow, exchanges Apple's identity token for
// a Supabase session, and decides where to send the user next.
// Returns the destination route, or null if the user cancelled / it failed
// (in the failure case an alert has already been shown).
export async function signInWithApple(): Promise<'Main' | 'Onboarding' | null> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      Alert.alert('Sign in failed', 'Apple did not return a token. Please try again.');
      return null;
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    if (error || !data.user) {
      Alert.alert('Sign in failed', error?.message ?? 'Please try again.');
      return null;
    }

    // Apple only sends the name on the FIRST sign-in ever — persist it so the
    // profile/onboarding can use it (subsequent sign-ins return null here).
    if (credential.fullName?.givenName) {
      await supabase.auth.updateUser({
        data: {
          first_name: credential.fullName.givenName,
          last_name: credential.fullName.familyName ?? '',
        },
      });
    }

    // A returning user already has a profile row → straight to the app.
    // A brand-new user has none yet → send them through onboarding.
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', data.user.id)
      .maybeSingle();

    return profile ? 'Main' : 'Onboarding';
  } catch (e: any) {
    // user tapped "Cancel" on the Apple sheet — not an error, just stop
    if (e.code === 'ERR_REQUEST_CANCELED') return null;
    Alert.alert('Sign in failed', 'Could not sign in with Apple. Please try again.');
    return null;
  }
}
