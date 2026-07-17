import { View, Text, StyleSheet,TouchableOpacity,Alert, Linking, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {useState, useEffect} from 'react';
import {useNavigation} from '@react-navigation/native';
import {Colors} from '../constants/colors';
import {supabase} from '../lib/supabase';
import { friendlyError } from '../lib/errors';
import { PRIVACY_URL, TERMS_URL } from '../constants/legal';
import DismissKeyboardView from './components/DismissKeyboardView';

export default function OnboardingScreen(){
    const navigation = useNavigation <any>();

    //tracks which of the three questions the user is on
    const[step, setStep] = useState(0);
    //store users answers
    const[ownsBoat, setOwnsBoat] = useState<string | null >(null);
    const[region, setRegion] = useState<string | null > (null);
    const[exprience, setExprience] = useState<string | null>(null);

    // Mandatory consent gate — every new user must confirm age + terms here,
    // UNLESS they already agreed on the signup screen (recorded in metadata).
    const [checkingConsent, setCheckingConsent] = useState(true);
    const [consentDone, setConsentDone] = useState(false);
    const [ageChecked, setAgeChecked] = useState(false);
    const [termsChecked, setTermsChecked] = useState(false);

    // Apple only shares your name on the very first-ever Sign in with Apple for
    // this app; Google can also omit it. When that happens, ask for it here
    // instead of leaving the account permanently stuck showing "Boater".
    const [needsName, setNeedsName] = useState(false);
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [nameError, setNameError] = useState('');

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            // already consented (email/social signup users) → skip the gate
            if (user?.user_metadata?.terms_accepted_at) setConsentDone(true);
            if (!user?.user_metadata?.first_name) setNeedsName(true);
            setCheckingConsent(false);
        })();
    }, []);

    function saveName() {
        if (!firstName.trim()) {
            setNameError('Please enter your first name');
            return;
        }
        setNameError('');
        setNeedsName(false);
    }

    async function acceptConsent() {
        if (!ageChecked || !termsChecked) return;
        await supabase.auth.updateUser({
            data: { age_confirmed: true, terms_accepted_at: new Date().toISOString() },
        });
        setConsentDone(true);
    }

    async function save_profile() {
        // get currently loggin user
        const{data: {user} } = await supabase.auth.getUser();
        if (!user) return;

        //save or updates this user profile
        const { error } = await supabase.from ('profiles').upsert ({
            id: user.id,
            first_name: firstName.trim() || user.user_metadata.first_name,
            last_name: lastName.trim() || user.user_metadata.last_name || '',
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
            navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
        }
    }
    //skips questioning and moves on
    function handleSkip(){
        handleNext();
    }
    // while we check whether consent was already given, render nothing (avoids flicker)
    if (checkingConsent) {
        return <SafeAreaView style={styles.safeArea} />;
    }

    // mandatory consent gate for users who haven't agreed yet
    if (!consentDone) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.container}>
                    <Text style={styles.question}>Before you start</Text>
                    <Text style={styles.subtitle}>Please confirm the following to use Narrows.</Text>

                    <TouchableOpacity style={styles.consentRow} onPress={() => setAgeChecked(!ageChecked)} activeOpacity={0.7}>
                        <Ionicons name={ageChecked ? 'checkbox' : 'square-outline'} size={24} color={ageChecked ? Colors.gold : '#8899AA'} />
                        <Text style={styles.consentText}>I confirm I am at least 13 years old.</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.consentRow} onPress={() => setTermsChecked(!termsChecked)} activeOpacity={0.7}>
                        <Ionicons name={termsChecked ? 'checkbox' : 'square-outline'} size={24} color={termsChecked ? Colors.gold : '#8899AA'} />
                        <Text style={styles.consentText}>
                            I agree to the{' '}
                            <Text style={styles.link} onPress={() => Linking.openURL(TERMS_URL)}>Terms of Service</Text>
                            {' '}and{' '}
                            <Text style={styles.link} onPress={() => Linking.openURL(PRIVACY_URL)}>Privacy Policy</Text>.
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.nextButton, (!ageChecked || !termsChecked) && styles.nextButtonDisabled]}
                        onPress={acceptConsent}
                        disabled={!ageChecked || !termsChecked}
                    >
                        <Text style={styles.nextButtonText}>Continue</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    // Apple/Google didn't provide a name — ask for it before continuing
    if (needsName) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <DismissKeyboardView>
                        <View style={styles.container}>
                            <Text style={styles.question}>What's your name?</Text>
                            <Text style={styles.subtitle}>This is how other boaters will see you on Narrows.</Text>

                            <TextInput
                                style={[styles.nameInput, nameError ? styles.nameInputError : null]}
                                placeholder="First name"
                                placeholderTextColor="#8899AA"
                                value={firstName}
                                onChangeText={setFirstName}
                            />
                            <TextInput
                                style={styles.nameInput}
                                placeholder="Last name"
                                placeholderTextColor="#8899AA"
                                value={lastName}
                                onChangeText={setLastName}
                            />
                            {nameError ? <Text style={styles.nameErrorText}>{nameError}</Text> : null}

                            <TouchableOpacity style={styles.nextButton} onPress={saveName}>
                                <Text style={styles.nextButtonText}>Continue</Text>
                            </TouchableOpacity>
                        </View>
                    </DismissKeyboardView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        );
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
  nextButtonDisabled: {
    opacity: 0.4,
  },
  nameInput: {
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
  nameInputError: {
    borderColor: '#FF4444',
  },
  nameErrorText: {
    color: '#FF4444',
    fontSize: 12,
    marginBottom: 8,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 20,
    paddingRight: 8,
  },
  consentText: {
    flex: 1,
    color: Colors.cream,
    fontSize: 15,
    lineHeight: 22,
  },
  link: {
    color: Colors.gold,
    fontWeight: '600',
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

