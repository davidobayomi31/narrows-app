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
  SafeAreaView,
} from 'react-native';
import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { supabase } from '../lib/supabase';


export default function SignupScreen() {
  const navigation = useNavigation<any>();

  // tracks what user types in each field
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // holds error messages for each field
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');

  // validates all fields before creating account
  async function validateAndSignup() {
    let valid = true;

    if (fullName.trim().length < 2) {
      setNameError('Please enter your full name');
      valid = false;
    } else {
      setNameError('');
    }

    if (!email.includes('@')) {
      setEmailError('Please enter a valid email address');
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

    if (valid) {
        const { error } = await supabase.auth.signUp({
            email,
            password, 
        });
        if(error) {
            alert(error.message);
        } else {
            // navigate to onboarding after successful signup
            navigation.navigate('Onboarding');
        }
      
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Image
          source={require('../assets/narrows-logo-clear.png')}
          style={styles.logo}
        />

        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.tagline}>Join our Narrows community</Text>

        <View style={styles.divider} />

        <TextInput
          style={[styles.input, nameError ? styles.inputError : null]}
          placeholder="Full Name"
          placeholderTextColor="#8899AA"
          value={fullName}
          onChangeText={setFullName}
        />
        {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}

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
            secureTextEntry={!showConfirmPassword}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowConfirmPassword(!showConfirmPassword)}
          >
            <Text style={styles.eyeText}>{showConfirmPassword ? '🔓' : '⚓'}</Text>
          </TouchableOpacity>
        </View>
        {confirmPasswordError ? <Text style={styles.errorText}>{confirmPasswordError}</Text> : null}

        <TouchableOpacity style={styles.signupButton} onPress={validateAndSignup}>
          <Text style={styles.signupButtonText}>Create Account</Text>
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