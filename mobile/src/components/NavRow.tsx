import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/useTheme';

interface Props {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  trailingIcon?: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
}

// Native screen transitions are instant, so a tap here has nothing real to
// wait on - but an instant transition with zero visual acknowledgment can
// read as "did that even register?" This shows a brief spinner in place of
// the trailing chevron so every tap gives the same felt response as the
// external links (ExternalLinkRow), whether or not there's an actual delay.
const FEEDBACK_MS = 180;

export default function NavRow({ onPress, style, trailingIcon = 'chevron-forward', children }: Props) {
  const { colors } = useTheme();
  const [pressed, setPressed] = useState(false);

  function handlePress() {
    if (pressed) return;
    setPressed(true);
    setTimeout(() => {
      setPressed(false);
      onPress();
    }, FEEDBACK_MS);
  }

  return (
    <Pressable style={style} onPress={handlePress} disabled={pressed}>
      {children}
      {pressed ? (
        <ActivityIndicator size="small" color={colors.textFaint} />
      ) : (
        <Ionicons name={trailingIcon} size={16} color={colors.textFaint} />
      )}
    </Pressable>
  );
}
