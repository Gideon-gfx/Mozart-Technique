import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import PrimaryButton from './PrimaryButton';

// A blocking outcome card for "did the checkout that just happened in an
// external browser actually go through" moments (wallet top-ups today) -
// distinct from Toast, which is easy to miss right as the app regains
// focus from the browser closing.
export default function PaymentResultModal({
  visible,
  status,
  title,
  message,
  onClose,
  colors,
}: {
  visible: boolean;
  status: 'success' | 'error';
  title: string;
  message: string;
  onClose: () => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isSuccess = status === 'success';
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.iconWrap, { backgroundColor: isSuccess ? `${colors.success}22` : `${colors.danger}22` }]}>
            <Ionicons name={isSuccess ? 'checkmark-circle' : 'close-circle'} size={44} color={isSuccess ? colors.success : colors.danger} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <PrimaryButton title="Done" onPress={onClose} style={{ marginTop: 18, alignSelf: 'stretch' }} />
        </Pressable>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 24 },
    card: { width: '100%', maxWidth: 340, backgroundColor: colors.surface, borderRadius: 20, padding: 24, alignItems: 'center' },
    iconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    title: { fontSize: 17, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 8, textAlign: 'center' },
    message: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center', lineHeight: 18 },
  });
}
