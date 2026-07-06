import { forwardRef } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';

type Props = { imageUri: string | null };

// Off-screen view captured with react-native-view-shot to produce a
// watermarked copy of a post's photo before it's shared anywhere.
const ShareCapture = forwardRef<View, Props>(({ imageUri }, ref) => {
  if (!imageUri) return null;
  return (
    <View ref={ref} collapsable={false} style={styles.container}>
      <Image source={{ uri: imageUri }} style={styles.image} />
      <View style={styles.watermark}>
        <Text style={styles.watermarkText}>⚓ Narrows</Text>
      </View>
    </View>
  );
});

export default ShareCapture;

const styles = StyleSheet.create({
  container: { width: 1080, height: 1080, backgroundColor: Colors.background },
  image: { width: '100%', height: '100%' },
  watermark: {
    position: 'absolute',
    bottom: 40,
    right: 40,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  watermarkText: { color: Colors.cream, fontSize: 32, fontWeight: '700' },
});
