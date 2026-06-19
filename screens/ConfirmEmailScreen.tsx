import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { supabase } from '../lib/supabase';

export default function ConfirmEmailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { email } = route.params;

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');

  async function verifyCode() {
    // the code must be 6 digits
    if (code.length !== 6) {
      setCodeError('Enter the 6-digit code from your email');
      return;
    }
    setCodeError('');

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'signup',
    });

    if (error) {
      setCodeError(error.message);
    } else {
      navigation.navigate('Onboarding');
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          We sent a 6-digit code to {email}
        </Text>

        <TextInput
          style={[styles.input, codeError ? styles.inputError : null]}
          placeholder="123456"
          placeholderTextColor="#8899AA"
          keyboardType="number-pad"
          maxLength={6}
          value={code}
          onChangeText={setCode}
        />
        {codeError ? <Text style={styles.errorText}>{codeError}</Text> : null}

        <TouchableOpacity style={styles.button} onPress={verifyCode}>
          <Text style={styles.buttonText}>Verify</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  title: {
    color: Colors.cream,
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    color: '#8899AA',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  input: {
    width: '100%',
    backgroundColor: '#1A1A1A',
    color: Colors.cream,
    padding: 16,
    borderRadius: 12,
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
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
    marginBottom: 8,
  },
  button: {
    width: '100%',
    backgroundColor: Colors.gold,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
});