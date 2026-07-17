import { Alert } from 'react-native';
import {
  GoogleSignin,
  isSuccessResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { supabase } from './supabase';

// webClientId = the "server" identity Supabase trusts; iosClientId = the native iOS credential.
// Both are public identifiers (not secrets), safe to keep in the app.
GoogleSignin.configure({
  webClientId: '68112871311-0qqm6la80bljlrslu28qca7k094ql8ur.apps.googleusercontent.com',
  iosClientId: '68112871311-r5e7q37ons8qc4ftdakj5d9tle3ngou3.apps.googleusercontent.com',
});

// Runs the native Google Sign-In flow, exchanges the ID token for a Supabase
// session, and decides where to send the user next.
// Returns the destination route, or null if cancelled / failed (alert shown).
export async function signInWithGoogle(): Promise<'Main' | 'AccountType' | null> {
  try {
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();

    // user backed out of the Google sheet
    if (!isSuccessResponse(response)) return null;

    const idToken = response.data.idToken;
    if (!idToken) {
      Alert.alert('Sign in failed', 'Google did not return a token. Please try again.');
      return null;
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error || !data.user) {
      Alert.alert('Sign in failed', error?.message ?? 'Please try again.');
      return null;
    }

    // save the Google name on first sign-in so the profile/onboarding can use it
    const googleUser = response.data.user;
    if (googleUser?.givenName) {
      await supabase.auth.updateUser({
        data: {
          first_name: googleUser.givenName,
          last_name: googleUser.familyName ?? '',
        },
      });
    }

    // returning user has a profile → app; brand-new user → pick account type
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', data.user.id)
      .maybeSingle();

    return profile ? 'Main' : 'AccountType';
  } catch (e: any) {
    if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) return null;
    Alert.alert('Sign in failed', 'Could not sign in with Google. Please try again.');
    return null;
  }
}
