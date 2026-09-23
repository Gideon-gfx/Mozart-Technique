import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAdminIdentity } from '../hooks/useAdminIdentity';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

// Analytics/Payouts/Activity filter by country NAME via a server-side
// ?regions= param that only Main Admin's request can actually control -
// for a Country Admin the server ignores this param entirely and forces
// their own country (see server.js's resolveRegionFilter), so there's no
// "All countries" option for them at all - the fixed flag in AdminHeader
// already shows which one, so this renders nothing for a Country Admin.
export default function AdminRegionFilter({ onChange }: { onChange: (regions: string | undefined) => void }) {
  const { isPrimary } = useAdminIdentity();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [text, setText] = useState('');

  if (!isPrimary) return null;

  return (
    <View style={styles.row}>
      <Ionicons name="earth-outline" size={15} color={colors.textFaint} />
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Filter by country name (comma-separated) - blank for all"
        placeholderTextColor={colors.textFaint}
        onSubmitEditing={() => onChange(text.trim() || undefined)}
      />
      {text ? (
        <Pressable
          onPress={() => {
            setText('');
            onChange(undefined);
          }}
          hitSlop={8}
        >
          <Ionicons name="close-circle" size={16} color={colors.textFaint} />
        </Pressable>
      ) : (
        <Pressable onPress={() => onChange(text.trim() || undefined)} hitSlop={8}>
          <Ionicons name="arrow-forward-circle" size={18} color={colors.primaryRed} />
        </Pressable>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginHorizontal: 20,
      marginBottom: 12,
    },
    input: { flex: 1, fontSize: 12.5, fontFamily: fonts.body, color: colors.text },
  });
}
