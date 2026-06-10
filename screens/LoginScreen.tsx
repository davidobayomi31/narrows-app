import { View, Text, StyleSheet, Image, TouchableOpacity} from 'react-native';
import { Colors } from '../constants/colors';

export default function LoginScreen() {
  return (
    <View style={styles.container}>
        <Image
            source = {require('../assets/narrows-logo.png')}
            style = {styles.logo}
        />
        <Text style={styles.title}>NARROWS</Text>
        <Text style={styles.tagline}>Run The Dock. Not Around It</Text>
        <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.appleButton}>
                <Text style={styles.appleButtonText}>Continue With Apple </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.googleButton}>
                <Text style={styles.googleButtonText}>Continue With Google</Text>
            </TouchableOpacity>
        </View>
    
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.navy,
  },
  logo: {
    width: 120,
    height: 120, 
    borderRadius: 20,
    marginTop:100,
    alignSelf: 'center'
  },
  title: {
    color: Colors.cream,
    fontSize: 36,
    fontWeight: 'bold',
    letterSpacing: 8,
    textAlign: 'center',
    marginTop: 24,
  },
  tagline:{
    color: '#8899AA',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
  },
  buttonContainer: {
    position: 'absolute', 
    bottom: 60,
    left: 24,
    right: 24, 
  },
  appleButton: {
    backgroundColor: Colors.black,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },

  appleButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },

  googleButton: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },

  googleButtonText: {
    color: Colors.black,
    fontSize: 16,
    fontWeight: '600',
  },




});