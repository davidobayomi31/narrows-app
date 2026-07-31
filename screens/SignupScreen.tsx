import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Colors } from '../constants/colors';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';
import { signInWithApple } from '../lib/appleAuth';
import { signInWithGoogle } from '../lib/googleAuth';
import { PRIVACY_URL, TERMS_URL } from '../constants/legal';
import DismissKeyboardView from './components/DismissKeyboardView';

// structural email check: something@something.tld, no spaces
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// well-known providers only ever use .com — catch the frequent truncation typos
// (e.g. gmail.co / gmail.con) that pass the structural check but never deliver
const OBVIOUS_TYPO = /@(gmail|googlemail|yahoo|hotmail|outlook|icloud|live|aol)\.(co|con|cm|om|c|comm|coom|cpm|xom|cim)$/i;

export default function SignupScreen() {
  const navigation = useNavigation<any>();

  // tracks what user types in each field
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  // masking flips on FOCUS, not on text length — see LoginScreen for why
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [confirmPasswordFocused, setConfirmPasswordFocused] = useState(false);

  // holds error messages for each field
  const [firstNameError, setFirstNameError] = useState('');
  const [lastNameError, setLastNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreeError, setAgreeError] = useState('');
  const [confirmedAge, setConfirmedAge] = useState(false);
  const [ageError, setAgeError] = useState('');

  // Sign in with Apple availability (iOS 13+ only)
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  // Age + Terms consent must be given before ANY signup method — including
  // Apple/Google — for legal validity and App Store compliance. Returns true
  // if both boxes are checked, otherwise shows the errors and returns false.
  function hasGivenConsent(): boolean {
    let ok = true;
    if (!confirmedAge) {
      setAgeError('You must be at least 13 years old to use Narrows');
      ok = false;
    } else {
      setAgeError('');
    }
    if (!agreedToTerms) {
      setAgreeError('You must agree to the Terms of Service and Privacy Policy');
      ok = false;
    } else {
      setAgreeError('');
    }
    return ok;
  }

  // records that consent was given, on the authenticated user's account
  async function recordConsent() {
    await supabase.auth.updateUser({
      data: { age_confirmed: true, terms_accepted_at: new Date().toISOString() },
    });
  }

  async function handleAppleSignIn() {
    if (!hasGivenConsent()) return;
    const destination = await signInWithApple();
    if (destination) {
      await recordConsent();
      navigation.navigate(destination);
    }
  }

  async function handleGoogleSignIn() {
    if (!hasGivenConsent()) return;
    const destination = await signInWithGoogle();
    if (destination) {
      await recordConsent();
      navigation.navigate(destination);
    }
  }

  // validates all fields before creating account
  async function validateAndSignup() {
    let valid = true;

    if (firstName.trim().length < 1) {
        setFirstNameError('Please enter your first name');
        valid = false;
    } else {
        setFirstNameError('');
    }

if (lastName.trim().length < 1) {
  setLastNameError('Please enter your last name');
  valid = false;
} else {
  setLastNameError('');
}

    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(cleanEmail)) {
      setEmailError('Please enter a valid email address');
      valid = false;
    } else if (OBVIOUS_TYPO.test(cleanEmail)) {
      setEmailError('Double-check your email — did you mean “.com”?');
      valid = false;
    } else {
      setEmailError('');
    }

    if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      valid = false;
    } else {
      setPasswordError('');
    }

    // checks both passwords match
    if (confirmPassword !== password) {
      setConfirmPasswordError('Passwords do not match');
      valid = false;
    } else {
      setConfirmPasswordError('');
    }

    if (!confirmedAge) {
      setAgeError('You must be at least 13 years old to use Narrows');
      valid = false;
    } else {
      setAgeError('');
    }

    if (!agreedToTerms) {
      setAgreeError('You must agree to the Terms of Service and Privacy Policy');
      valid = false;
    } else {
      setAgreeError('');
    }

    if (valid) {
        const { error } = await supabase.auth.signUp({
            email: cleanEmail,
            password,
            options: {
                data: {
                    first_name: firstName,
                    last_name: lastName,
                    // consent captured here — lets Onboarding skip re-asking
                    age_confirmed: true,
                    terms_accepted_at: new Date().toISOString(),
                },
            },
        });
        if(error) {
            Alert.alert("Sign up failed", friendlyError(error));
        } else {
            // navigate to the code screen with the normalized email
            navigation.navigate('ConfirmEmail', { email: cleanEmail });
        }

    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <DismissKeyboardView>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <Image
          source={require('../assets/narrows-logo-clear.png')}
          style={styles.logo}
        />

        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.tagline}>Join our Narrows community</Text>

        <View style={styles.divider} />

        <TextInput
        style={[styles.input, firstNameError ? styles.inputError : null]}
        placeholder="First Name"
        placeholderTextColor="#8899AA"
        value={firstName}
        onChangeText={setFirstName}
        />
        {firstNameError ? <Text style={styles.errorText}>{firstNameError}</Text> : null}

        <TextInput
        style={[styles.input, lastNameError ? styles.inputError : null]}
        placeholder="Last Name"
        placeholderTextColor="#8899AA"
        value={lastName}
        onChangeText={setLastName}
        />
        {lastNameError ? <Text style={styles.errorText}>{lastNameError}</Text> : null}

        <TextInput
          style={[styles.input, emailError ? styles.inputError : null]}
          placeholder="Email"
          placeholderTextColor="#8899AA"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}

        <View style={styles.passwordRow}>
          <TextInput
            style={[styles.input, styles.passwordInput, passwordError ? styles.inputError : null]}
            placeholder="Password"
            placeholderTextColor="#8899AA"
            secureTextEntry={!showPassword && (passwordFocused || password.length > 0)}
            value={password}
            onChangeText={setPassword}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowPassword(!showPassword)}
          >
            <Text style={styles.eyeText}>{showPassword ? '🔓' : '⚓'}</Text>
          </TouchableOpacity>
        </View>
        {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}

        <View style={styles.passwordRow}>
          <TextInput
            style={[styles.input, styles.passwordInput, confirmPasswordError ? styles.inputError : null]}
            placeholder="Confirm Password"
            placeholderTextColor="#8899AA"
            secureTextEntry={!showConfirmPassword && (confirmPasswordFocused || confirmPassword.length > 0)}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            onFocus={() => setConfirmPasswordFocused(true)}
            onBlur={() => setConfirmPasswordFocused(false)}
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowConfirmPassword(!showConfirmPassword)}
          >
            <Text style={styles.eyeText}>{showConfirmPassword ? '🔓' : '⚓'}</Text>
          </TouchableOpacity>
        </View>
        {confirmPasswordError ? <Text style={styles.errorText}>{confirmPasswordError}</Text> : null}

        <TouchableOpacity
          style={styles.agreeRow}
          onPress={() => setConfirmedAge(!confirmedAge)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={confirmedAge ? 'checkbox' : 'square-outline'}
            size={22}
            color={confirmedAge ? Colors.gold : '#8899AA'}
          />
          <Text style={styles.legalText}>I confirm I am at least 13 years old.</Text>
        </TouchableOpacity>
        {ageError ? <Text style={styles.agreeErrorText}>{ageError}</Text> : null}

        <TouchableOpacity
          style={styles.agreeRow}
          onPress={() => setAgreedToTerms(!agreedToTerms)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={agreedToTerms ? 'checkbox' : 'square-outline'}
            size={22}
            color={agreedToTerms ? Colors.gold : '#8899AA'}
          />
          <Text style={styles.legalText}>
            I agree to the{' '}
            <Text style={styles.legalLink} onPress={() => Linking.openURL(TERMS_URL)}>
              Terms of Service
            </Text>{' '}
            and{' '}
            <Text style={styles.legalLink} onPress={() => Linking.openURL(PRIVACY_URL)}>
              Privacy Policy
            </Text>
          </Text>
        </TouchableOpacity>
        {agreeError ? <Text style={styles.agreeErrorText}>{agreeError}</Text> : null}

        <TouchableOpacity style={styles.signupButton} onPress={validateAndSignup}>
          <Text style={styles.signupButtonText}>Create Account</Text>
        </TouchableOpacity>

        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>or</Text>
          <View style={styles.orLine} />
        </View>

        {appleAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={12}
            style={styles.appleButton}
            onPress={handleAppleSignIn}
          />
        )}

        <TouchableOpacity style={styles.googleButton} onPress={handleGoogleSignIn}>
          <Ionicons name="logo-google" size={18} color={Colors.black} />
          <Text style={styles.googleButtonText}>Continue with Google</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.loginRow}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.loginText}>
            Already have an account?{' '}
            <Text style={styles.loginLink}>Log in</Text>
          </Text>
        </TouchableOpacity>

      </ScrollView>
      </DismissKeyboardView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flexGrow: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  logo: {
    width: 120,
    height: 120,
    marginTop: 60,
  },
  title: {
    color: Colors.cream,
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 4,
    textAlign: 'center',
    marginTop: 16,
  },
  tagline: {
    color: '#8899AA',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#2E4057',
    marginVertical: 24,
  },
  input: {
    width: '100%',
    backgroundColor: '#1A1A1A',
    color: Colors.cream,
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333333',
  },
  inputError: {
    borderColor: '#FF4444',
  },
  errorText: {
    color: '#FF4444',
    fontSize: 12,
    alignSelf: 'flex-start',
    marginTop: -8,
    marginBottom: 8,
  },
  passwordRow: {
    width: '100%',
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 52,
  },
  eyeButton: {
    position: 'absolute',
    right: 16,
    top: 14,
  },
  eyeText: {
    fontSize: 20,
  },
  agreeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    width: '100%',
    marginTop: 8,
    marginBottom: 4,
  },
  legalText: {
    flex: 1,
    color: '#8899AA',
    fontSize: 13,
    lineHeight: 18,
  },
  agreeErrorText: {
    color: '#FF4444',
    fontSize: 12,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  legalLink: {
    color: Colors.gold,
    fontWeight: '600',
  },
  signupButton: {
    width: '100%',
    backgroundColor: Colors.gold,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  signupButtonText: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
  },
  orLine: { flex: 1, height: 1, backgroundColor: '#2E4057' },
  orText: { color: '#8899AA', fontSize: 13, marginHorizontal: 12 },
  appleButton: {
    width: '100%',
    height: 50,
    marginBottom: 12,
  },
  googleButton: {
    width: '100%',
    height: 50,
    borderRadius: 12,
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 24,
  },
  googleButtonText: {
    color: Colors.black,
    fontSize: 16,
    fontWeight: '600',
  },
  loginRow: {
    marginTop: 8,
  },
  loginText: {
    color: '#8899AA',
    fontSize: 14,
  },
  loginLink: {
    color: Colors.gold,
    fontWeight: '600',
  },
  safeArea: {
  flex: 1,
  backgroundColor: Colors.background,
},
});