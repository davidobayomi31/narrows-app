import { Keyboard, TouchableWithoutFeedback, View, ViewStyle } from 'react-native';

// Wrap a screen's content in this so tapping any empty space dismisses the
// keyboard. Taps that land on a real control (button, text field, etc.) still
// reach that control first — this only fires when the tap hits open space.
export default function DismissKeyboardView({
  children,
  style,
}: {
  children: React.ReactNode;
  // defaults to flex: 1 (a full-screen wrap); pass your own style to size it
  // differently instead (e.g. a compact bottom-sheet section) — it replaces
  // the default rather than merging with it.
  style?: ViewStyle;
}) {
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={style ?? { flex: 1 }}>{children}</View>
    </TouchableWithoutFeedback>
  );
}
