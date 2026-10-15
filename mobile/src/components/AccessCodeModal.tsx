import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError } from '../api/client';
import * as organizationsApi from '../api/organizations';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import PrimaryButton from './PrimaryButton';

// Same real /api/redeem-code flow as the student dashboard's "Sponsor
// Access Code" action - a tutor can be linked to another organization the
// same way, from either the Tutor or an Organization Tutor dashboard.
export default function AccessCodeModal({ visible, onClose, colors }: { visible: boolean; onClose: () => void; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const { refresh } = useAuth();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setCode('');
      setOrgName(null);
    }
  }, [visible]);

  async function redeem() {
    if (!code.trim()) {
      toast('Enter a code.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const result = await organizationsApi.redeemCode(code.trim());
      setOrgName(result.orgName);
      // Redeeming changes the account's own hasSponsorAccess/organization-
      // Memberships (server-side) - without this, Profile's "<org> Tutor"
      // row would stay hidden until the next cold start re-fetches
      // /api/session, same staleness bug RoleStatusBanner hit earlier.
      refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not redeem that code.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          {orgName ? (
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Ionicons name="checkmark-circle" size={36} color={colors.success} />
              <Text style={styles.sheetTitle}>Code redeemed</Text>
              <Text style={styles.fieldLabel}>You&apos;re now connected to {orgName}.</Text>
              <PrimaryButton title="Done" onPress={onClose} style={{ marginTop: 8, alignSelf: 'stretch' }} />
            </View>
          ) : (
            <>
              <Text style={styles.sheetTitle}>Access code</Text>
              <Text style={styles.fieldLabel}>Enter the code your organization gave you to link your account.</Text>
              <TextInput style={styles.input} value={code} onChangeText={setCode} placeholder="Enter code" placeholderTextColor={colors.textFaint} autoCapitalize="characters" />
              <PrimaryButton title="Redeem code" onPress={redeem} loading={submitting} style={{ marginTop: 16 }} />
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 34 },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
    sheetTitle: { fontSize: 16, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 14, textAlign: 'center' },
    fieldLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textFaint, marginTop: 10, marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      fontFamily: fonts.body,
      color: colors.text,
      backgroundColor: colors.background,
    },
  });
}
