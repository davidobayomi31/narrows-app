import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';

export default function ResetPasswordScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { email } = route.params;

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [loading, setLoading] = useState(false);

  async function verifyCode() {
    if (code.length !== 6) {
      setCodeError('Enter the 6-digit code from your email');
      return;
    }
    setCodeError('');
    setLoading(true);

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'recovery',
    });

    setLoading(false);

    if (error) {
      setCodeError(error.message);
    } else {
      navigation.navigate('SetNewPassword');
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Enter your code</Text>
        <Text style={styles.subtitle}>We sent a code to {email}</Text>

        <TextInput
          style={[styles.input, styles.codeInput, codeError ? styles.inputError : null]}
          placeholder="123456"
          placeholderTextColor="#8899AA"
          keyboardType="number-pad"
          maxLength={6}
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          value={code}
          onChangeText={setCode}
        />
        {codeError ? <Text style={styles.errorText}>{codeError}</Text> : null}

        <TouchableOpacity style={styles.button} onPress={verifyCode} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={Colors.background} />
          ) : (
            <Text style={styles.buttonText}>Verify</Text>
          )}
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
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333333',
  },
  codeInput: {
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
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
