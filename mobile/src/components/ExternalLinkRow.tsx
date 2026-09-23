import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/useTheme';

interface Props {
  url: string;
  style?: StyleProp<ViewStyle>;
  trailingIcon?: keyof typeof Ionicons.glyphMap;
  trailingColor?: string;
  onBeforeOpen?: () => void;
  children: React.ReactNode;
}

// Opening a browser has a real, sometimes-noticeable OS-level delay - this
// shows a brief spinner in place of the trailing icon for the duration, so
// a tap always gives immediate feedback instead of appearing to do nothing
// until the browser view appears.
export default function ExternalLinkRow({ url, style, trailingIcon = 'open-outline', trailingColor, onBeforeOpen, children }: Props) {
  const { colors } = useTheme();
  const [opening, setOpening] = useState(false);

  async function handlePress() {
    if (opening) return;
    onBeforeOpen?.();
    setOpening(true);
    try {
      await Linking.openURL(url);
    } finally {
      setOpening(false);
    }
  }

  return (
    <Pressable style={style} onPress={handlePress} disabled={opening}>
      {children}
      {opening ? (
        <ActivityIndicator size="small" color={trailingColor || colors.textFaint} />
      ) : (
        <Ionicons name={trailingIcon} size={15} color={trailingColor || colors.textFaint} />
      )}
    </Pressable>
  );
}
