import {useEffect} from 'react';
import {View, Image, StyleSheet} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import * as LocalAuthentication from 'expo-local-authentication';
import {Colors} from '../constants/colors';

export default function SplashScreen(){
    const navigation = useNavigation<any>();

    useEffect(() => {
        checkLoginStatus();
    }, []);

    async function checkLoginStatus() {
        //wait 2 sec to show the logo
        await new Promise(resolve => setTimeout(resolve, 2000));

        //check if use is still logged in - placeholder for now
        const isLoggedIn = true; //change to false when done
        const hasCredentials = false;

        if (isLoggedIn){
            navigation.navigate('Home');
        } else if (hasCredentials) {
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Welcome back to Narrows',
                fallbackLabel: 'Use password',
            });
            if(result.success){
                navigation.navigate('Home');
            } else {
                navigation.navigate('Login');
            }
        } else {
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



