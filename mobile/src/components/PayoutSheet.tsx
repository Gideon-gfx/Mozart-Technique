import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import * as tutorsApi from '../api/tutors';
import { ApiError } from '../api/client';
import { useToast } from '../context/ToastContext';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import PrimaryButton from './PrimaryButton';

// Shared by the Tutor dashboard and the Organization Tutor dashboard - one
// real tutor wallet regardless of which workspace it's opened from.
export default function PayoutSheet({ visible, onClose, colors, balanceUsd }: { visible: boolean; onClose: () => void; colors: ThemeColors; balanceUsd: number }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const [accountName, setAccountName] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingAmount, setPendingAmount] = useState(0);
  const [hasDetails, setHasDetails] = useState(false);

  useEffect(() => {
    if (!visible) return;
    tutorsApi
      .fetchMyPayouts()
      .then((data) => {
        setPendingAmount(data.pendingAmountUsd);
        setHasDetails(Boolean(data.payoutDetails));
        if (data.payoutDetails) {
          setAccountName(data.payoutDetails.accountName || '');
          setBankName(data.payoutDetails.bankName || '');
          setAccountNumber(data.payoutDetails.accountNumber || '');
        }
      })
      .catch(() => {});
  }, [visible]);

  async function saveAndWithdraw() {
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      toast('Enter a valid withdrawal amount.', 'error');
      return;
    }
    setSaving(true);
    try {
      if (!hasDetails || accountName || bankName || accountNumber) {
        if (!accountName.trim() || !bankName.trim() || !accountNumber.trim()) {
          toast('Add your account name, bank name, and account number.', 'error');
          setSaving(false);
          return;
        }
        await tutorsApi.savePayoutDetails({ accountName: accountName.trim(), bankName: bankName.trim(), accountNumber: accountNumber.trim() });
      }
      await tutorsApi.requestWithdrawal(amountNum);
      toast('Payout requested - an admin will process it.', 'success');
      setAmount('');
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not request that payout.', 'error');
    } finally {
      setSaving(false);
    }
  }

  const withdrawable = Math.max(0, balanceUsd - pendingAmount);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Wallet & payout</Text>
          <View style={styles.walletHero}>
            <Text style={styles.walletBalance}>${balanceUsd.toFixed(2)}</Text>
            <Text style={styles.walletBalanceLabel}>Available balance</Text>
            {pendingAmount > 0 ? <Text style={styles.walletPendingText}>${pendingAmount.toFixed(2)} pending review</Text> : null}
          </View>
          <Text style={styles.fieldLabel}>Account name</Text>
          <TextInput style={styles.input} value={accountName} onChangeText={setAccountName} placeholder="Full name on account" placeholderTextColor={colors.textFaint} />
          <Text style={styles.fieldLabel}>Bank name</Text>
          <TextInput style={styles.input} value={bankName} onChangeText={setBankName} placeholder="Bank name" placeholderTextColor={colors.textFaint} />
          <Text style={styles.fieldLabel}>Account number</Text>
          <TextInput style={styles.input} value={accountNumber} onChangeText={setAccountNumber} placeholder="Account number" placeholderTextColor={colors.textFaint} keyboardType="number-pad" />
          <Text style={styles.fieldLabel}>Amount to withdraw (up to ${withdrawable.toFixed(2)})</Text>
          <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={colors.textFaint} keyboardType="decimal-pad" />
          <PrimaryButton title="Request payout" onPress={saveAndWithdraw} loading={saving} style={{ marginTop: 16 }} />
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
    walletHero: { alignItems: 'center', backgroundColor: colors.background, borderRadius: 14, paddingVertical: 16, marginBottom: 16 },
    walletBalance: { fontSize: 26, fontFamily: fonts.displayBlack, color: colors.text },
    walletBalanceLabel: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    walletPendingText: { fontSize: 11.5, fontFamily: fonts.bodySemiBold, color: colors.statusPendingText, marginTop: 6 },
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
