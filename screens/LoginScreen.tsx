import {View, Text, StyleSheet, Image,TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ScrollView, Alert,  } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { Colors } from '../constants/colors';
import * as LocalAuthentication from 'expo-local-authentication';
import { useNavigation } from '@react-navigation/native';
import {supabase}  from '../lib/supabase';
import { friendlyError } from '../lib/errors'

export default function LoginScreen() {
  // tracks what the user types in each field
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigation = useNavigation<any>();

  // controls whether password characters are visible
  const [showPassword, setShowPassword] = useState(false);

  // holds error messages shown below each input
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // checks email and password before allowing login
  async function validateAndLogin() {
    let valid = true;

    // email must contain @ symbol
    if (!email.includes('@')) {
      setEmailError('Please enter a valid email address');
      valid = false;
    } else {
      setEmailError('');
    }

    // password must be at least 6 characters
    if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      valid = false;
    } else {
      setPasswordError('');
    }

    if (valid) {
      const {error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error){
        Alert.alert('Login failed', friendlyError(error));
      } else {
        navigation.navigate('Home');
      }
    } 
  }

  return (
    // pushes content up when keyboard appears so inputs stay visible
    <SafeAreaView style={styles.safeArea}>
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* allows the screen to scroll if content overflows */}
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <Image
          source={require('../assets/narrows-logo-clear.png')}
          style={styles.logo}
        />

        <Text style={styles.title}>NARROWS</Text>
        <Text style={styles.tagline}>Run The Dock. Not Around It</Text>

        <View style={styles.divider} />

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
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
          />
          {/* anchor = locked, unlocked = password visible */}
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowPassword(!showPassword)}
          >
            <Text style={styles.eyeText}>{showPassword ? '🔓' : '⚓'}</Text>
          </TouchableOpacity>
        </View>
        {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}

        <TouchableOpacity style={styles.forgotPassword}>
          <Text style={styles.forgotPasswordText}>Forgot password?</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.loginButton} onPress={validateAndLogin}>
          <Text style={styles.loginButtonText}>Log In</Text>
        </TouchableOpacity>

        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>or</Text>
          <View style={styles.orLine} />
        </View>

        <TouchableOpacity style={styles.appleButton}>
          <Text style={styles.appleButtonText}>Continue with Apple</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.googleButton}>
          <Text style={styles.googleButtonText}>Continue with Google</Text>
        </TouchableOpacity>

        {/* navigates to signup screen — navigation to be wired up later */}
        <TouchableOpacity 
        style={styles.signupRow}
        onPress={() => navigation.navigate('Signup')} >
          <Text style={styles.signupText}>
            Don't have an account?{' '}
            <Text style={styles.signupLink}>Sign up</Text>
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
   </SafeAreaView>
  );
}

//face id / touch id /fingerprint
async function handlesBiometricLogin()  {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();

  if (!hasHardware || !isEnrolled){
    Alert.alert('Biometric Authentication is not available on this device');
    return
  }

  const result = await LocalAuthentication.authenticateAsync ({
  promptMessage: 'Sign in to Narrows',
  fallbackLabel: 'Use password',
});

if (result.success) {
  console.log('Biometric Login successful');
  //replace with real auth later

}
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
    width: 150,
    height: 150,
    marginTop: 80,
  },
  title: {
    color: Colors.cream,
    fontSize: 36,
    fontWeight: 'bold',
    letterSpacing: 8,
    textAlign: 'center',
    marginTop: 16,
  },
  tagline: {
    color: '#8899AA',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#2E4057',
    marginVertical: 32,
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
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotPasswordText: {
    color: Colors.gold,
    fontSize: 14,
  },
  loginButton: {
    width: '100%',
    backgroundColor: Colors.gold,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  loginButtonText: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  orRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#2E4057',
  },
  orText: {
    color: '#8899AA',
    marginHorizontal: 12,
    fontSize: 14,
  },
  appleButton: {
  width: '100%',
  backgroundColor: Colors.white,
  padding: 16,
  borderRadius: 12,
  alignItems: 'center',
  marginBottom: 12,
},
appleButtonText: {
  color: Colors.black,
  fontSize: 16,
  fontWeight: '600',
},
  googleButton: {
    width: '100%',
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 32,
  },
  googleButtonText: {
    color: Colors.black,
    fontSize: 16,
    fontWeight: '600',
  },
  signupRow: {
    marginTop: 8,
  },
  signupText: {
    color: '#8899AA',
    fontSize: 14,
  },
  signupLink: {
    color: Colors.gold,
    fontWeight: '600',
  },
  safeArea: {
  flex: 1,
  backgroundColor: Colors.background,
},
});