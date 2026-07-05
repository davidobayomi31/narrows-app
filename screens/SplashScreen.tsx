import {useEffect} from 'react';
import {View, Image, StyleSheet} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import * as LocalAuthentication from 'expo-local-authentication';
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

        //check if use is still logged in - placeholder for now
        const {data} = await supabase.auth.getSession();
        if (data.session) {
            // prefetch Home's data in parallel with the minimum logo display,
            // so Home never needs to show its own loading screen right after this
            await Promise.all([loadHomeData(), minDisplay]);
            navigation.navigate('Main');
        } else {
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



