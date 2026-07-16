import {useEffect} from 'react';
import {View, Image, StyleSheet} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Colors} from '../constants/colors';
import {supabase} from '../lib/supabase';
import {loadHomeData} from '../lib/homeData';


export default function SplashScreen(){
    const navigation = useNavigation<any>();

    useEffect(() => {
        checkLoginStatus();
    }, []);

    async function checkLoginStatus() {
        const minDisplay = new Promise(resolve => setTimeout(resolve, 2000));

        try {
            // getSession() reads the saved session from local storage (no network),
            // so this still works with no wifi/service. The signedIn flag is a
            // safety net: if an expired token can't refresh offline and getSession
            // returns null, a previously signed-in user still gets into the app
            // (screens then fall back to their cached data).
            const {data} = await supabase.auth.getSession();
            const signedInBefore = await AsyncStorage.getItem('narrows.signedIn');
            if (data.session || signedInBefore) {
                // prefetch Home's data in parallel with the minimum logo display.
                // loadHomeData() never rejects (it falls back to cache offline),
                // so the splash always moves on instead of hanging on the logo.
                await Promise.all([loadHomeData(), minDisplay]);
                navigation.navigate('Main');
            } else {
                await minDisplay;
                navigation.navigate('Login');
            }
        } catch {
            // last-resort guard: never strand the user on the splash screen
            await minDisplay;
            navigation.navigate('Login');
        }
    }

    return (
        <View style = {styles.container}>
            <Image
            source={require('../assets/narrows-logo-clear.png')}
            style={styles.logo}
            />
        </View>
    );
}

const styles= StyleSheet.create({
    container: {
        flex:1,
        backgroundColor: Colors.background,
        alignItems: 'center',
        justifyContent: 'center',
    },

    logo:{
        width:200,
        height: 200,
    },
});



