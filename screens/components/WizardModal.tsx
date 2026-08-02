import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import DismissKeyboardView from './DismissKeyboardView';

// Generic multi-step wizard shell — booking flows (winterization, slip,
// rental, storage, haul-out) all share this chrome: progress dots, a
// Back/Continue footer, and per-step validation gating Continue. Each flow
// owns its own field state and just tells the shell which step is active,
// whether that step is complete enough to continue, and what to render.
//
// The LAST step's Continue button becomes the submit action — the parent
// decides what onContinue() does based on whether stepIndex is the last one.
type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  stepTitles: string[];
  stepIndex: number;
  canContinue: boolean;
  onBack: () => void;
  onContinue: () => void;
  submitting?: boolean;
  submitLabel?: string;
  children: React.ReactNode;
};

export default function WizardModal({
  visible,
  onClose,
  title,
  stepTitles,
  stepIndex,
  canContinue,
  onBack,
  onContinue,
  submitting = false,
  submitLabel = 'Submit',
  children,
}: Props) {
  const insets = useSafeAreaInsets();
  const isLastStep = stepIndex === stepTitles.length - 1;
  const isFirstStep = stepIndex === 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.spacer} onPress={onClose} />
        <KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.stepLabel}>{stepTitles[stepIndex]}</Text>
            <View style={styles.dotsRow}>
              {stepTitles.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i === stepIndex && styles.dotActive,
                    i < stepIndex && styles.dotDone,
                  ]}
                />
              ))}
            </View>
          </View>

          <DismissKeyboardView style={{ flex: 0 }}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 20 }]}
            >
              {children}
            </ScrollView>
          </DismissKeyboardView>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            {!isFirstStep && (
              <TouchableOpacity style={styles.backButton} onPress={onBack} disabled={submitting}>
                <Ionicons name="chevron-back" size={18} color={Colors.cream} />
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.continueButton,
                isFirstStep && styles.continueButtonFull,
                (!canContinue || submitting) && styles.continueButtonDisabled,
              ]}
              onPress={onContinue}
              disabled={!canContinue || submitting}
            >
              {submitting ? (
                <ActivityIndicator color={Colors.background} />
              ) : (
                <Text style={styles.continueButtonText}>{isLastStep ? submitLabel : 'Continue'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  spacer: { flex: 1 },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#3A3A3A', alignSelf: 'center', marginTop: 10, marginBottom: 4 },

  header: { paddingHorizontal: 20, paddingTop: 8 },
  title: { color: Colors.cream, fontSize: 20, fontWeight: '700' },
  stepLabel: { color: Colors.gold, fontSize: 13, fontWeight: '600', marginTop: 4 },
  dotsRow: { flexDirection: 'row', gap: 6, marginTop: 10, marginBottom: 4 },
  dot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceAlt },
  dotActive: { backgroundColor: Colors.gold },
  dotDone: { backgroundColor: Colors.gold, opacity: 0.5 },

  content: { paddingHorizontal: 20, paddingTop: 16 },

  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2A2A2A',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: '#333333',
  },
  backButtonText: { color: Colors.cream, fontSize: 15, fontWeight: '600', marginLeft: 2 },

  continueButton: { flex: 1, backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  continueButtonFull: { flex: 1 },
  continueButtonDisabled: { opacity: 0.4 },
  continueButtonText: { color: Colors.background, fontSize: 16, fontWeight: '700' },
});
