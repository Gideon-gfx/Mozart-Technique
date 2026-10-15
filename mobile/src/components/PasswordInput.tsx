import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

type Props = Omit<TextInputProps, 'secureTextEntry' | 'style'>;

// A plain TextInput would need secureTextEntry hardcoded on every password
// field across Login/SignUp/ResetPassword - this centralizes the show/hide
// toggle so all three stay identical.
export default function PasswordInput(props: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrapper}>
      <TextInput
        {...props}
        secureTextEntry={!visible}
        style={styles.input}
        placeholderTextColor={colors.textFaint}
      />
      <Pressable onPress={() => setVisible((v) => !v)} hitSlop={10} style={styles.toggle}>
        <Ionicons name={visible ? 'eye-off' : 'eye'} size={19} color={colors.textFaint} />
      </Pressable>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.surface,
      marginBottom: 12,
    },
    input: {
      flex: 1,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 15,
      fontFamily: fonts.body,
      color: colors.text,
    },
    toggle: {
      paddingHorizontal: 14,
    },
  });
}
