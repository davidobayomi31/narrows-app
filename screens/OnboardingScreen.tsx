import { View, Text, StyleSheet,TouchableOpacity,Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {useState} from 'react';
import {useNavigation} from '@react-navigation/native';
import {Colors} from '../constants/colors';
import {supabase} from '../lib/supabase';
import { friendlyError } from '../lib/errors';

export default function OnboardingScreen(){
    const navigation = useNavigation <any>();

    //tracks which of the three questions the user is on
    const[step, setStep] = useState(0);
    //store users answers
    const[ownsBoat, setOwnsBoat] = useState<string | null >(null);
    const[region, setRegion] = useState<string | null > (null);
    const[exprience, setExprience] = useState<string | null>(null);

    async function save_profile() {
        // get currently loggin user
        const{data: {user} } = await supabase.auth.getUser();
        if (!user) return;

        //save or updates this user profile
        const { error } = await supabase.from ('profiles').upsert ({
            id: user.id,
            first_name: user.user_metadata.first_name,
            last_name: user.user_metadata.last_name,
            boat_ownership: ownsBoat,
            region: region,
            experience_level: exprience,
        });
        if (error){
            Alert.alert('Could not save', friendlyError(error));
        }

    }

    // move on to next question or home if last question
    async function handleNext(){
        if (step < 2) {
           setStep (step + 1);
        }else{
            await save_profile();
            navigation.navigate('Main')
        }
    }
    //skips questioning and moves on
    function handleSkip(){
        handleNext();
    }
    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>

                <View style={styles.dotsRow}>
                    {[0,1,2].map((i) =>(
                        <View
                            key={i}
                            style={[styles.dot, step === i ? styles.dotActive : null]}
                        />

                    ))}
                </View>

                {/* Question 1 */}
                {step === 0 && (
                    <View style={styles.questionBlock}>
                        <Text style={styles.question}>Do you Own a boat?</Text>
                        <Text style={styles.subtitle}>Help us personalize your experience</Text>

                        <TouchableOpacity
                            style = {[styles.optionButton, ownsBoat === 'yes' ? 
                                styles.optionSelected : null]}
                                onPress= {() => setOwnsBoat ('yes')}
                        >
                            <Text style={styles.optionText}>Yes, I own a boat</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.optionButton, ownsBoat === 'no' ? styles.optionSelected : null]}
                                onPress={() => setOwnsBoat('no')}
                            >
                                <Text style={styles.optionText}>No, I don't own one </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.optionButton, ownsBoat === 'access' ? styles.optionSelected : null]}
                            onPress={() => setOwnsBoat('access')}
                        >
                            <Text style={styles.optionText}>I have access to one</Text>
                        </TouchableOpacity>
                        </View>         
                )}

                {/* Question 2*/}
                {step === 1 && (
                <View style={styles.questionBlock}>
                    <Text style={styles.question}>Where do you boat?</Text>
                    <Text style={styles.subtitle}>Select your home region</Text>

                    {['Simcoe County', 'Georgian Bay', 'Lake Ontario', 'Lake Erie', 'Other'].map((r) => (
                    <TouchableOpacity
                        key={r}
                        style={[styles.optionButton, region === r ? styles.optionSelected : null]}
                        onPress={() => setRegion(r)}
                    >
                        <Text style={styles.optionText}>{r}</Text>
                    </TouchableOpacity>
                    ))}
                </View>
                )}
                {/*Question 3 */}
                {step === 2 && (
                    <View style = {styles.questionBlock}>
                        <Text style={styles.question}>What's your experience on the water? </Text>
                        <Text style={styles.subtitle}>We'll tailor content to your skill level</Text>

                        {['Beginner', 'Intermediate', 'Experienced', 'Professional'].map((e) => (
                        <TouchableOpacity
                            key={e}
                            style={[styles.optionButton, exprience === e ? styles.optionSelected : null]}
                            onPress={() => setExprience(e)}
                        >
                            <Text style={styles.optionText}>{e}</Text>
                        </TouchableOpacity>
                        ))}
                    </View>
                    )}

                    {/* next and skip buttons */}
                    <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
                    <Text style={styles.nextButtonText}>
                        {step === 2 ? 'Get Started' : 'Next'}
                    </Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
                    <Text style={styles.skipText}>Skip for now</Text>
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
    backgroundColor: Colors.background,
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 48,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#333333',
    marginHorizontal: 4,
  },
  dotActive: {
    backgroundColor: Colors.gold,
    width: 24,
  },
  questionBlock: {
    flex: 1,
  },
  question: {
    color: Colors.cream,
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    color: '#8899AA',
    fontSize: 14,
    marginBottom: 32,
  },
  optionButton: {
    width: '100%',
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333333',
  },
  optionSelected: {
    borderColor: Colors.gold,
    backgroundColor: '#1A1200',
  },
  optionText: {
    color: Colors.cream,
    fontSize: 16,
  },
  nextButton: {
    width: '100%',
    backgroundColor: Colors.gold,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  nextButtonText: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  skipButton: {
    alignItems: 'center',
    paddingBottom: 24,
  },
  skipText: {
    color: '#8899AA',
    fontSize: 14,
  },
});

