import React from 'react';
import { Image, StyleSheet } from 'react-native';

// A very faint background illustration (the user's own Mozart character
// artwork) behind a screen's real content. Rendered as an early child
// inside a screen's own root container (which still paints its normal
// colors.background flat color first) - the low opacity means it reads
// as a whisper of the image tinted by whatever the theme's flat color is,
// so the same file works on both light and dark theme without needing two
// separate pre-baked variants. Non-interactive, so it never intercepts
// touches meant for the screen's actual content.
export default function ScreenWatermark() {
  return (
    <Image
      source={require('../../assets/faint-background-image.jpeg')}
      style={styles.watermark}
      resizeMode="cover"
    />
  );
}

const styles = StyleSheet.create({
  watermark: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.14,
  },
});
