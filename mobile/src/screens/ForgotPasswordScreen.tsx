import { ScrollView } from '../components/LiquidScroll';
import Pressable from '../components/LiquidPressable';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View,  } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BackButton from '../components/BackButton';
import PasswordInput from '../components/PasswordInput';
import PrimaryButton from '../components/PrimaryButton';
import * as authApi from '../api/auth';
import { ApiError } from '../api/client';
import type { AuthStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Three real steps: email -> the 6-digit code emailed to that address
// (data/mailer.js's sendPasswordResetEmail), checked on its own via
// /api/auth/verify-reset-code before moving on, so a wrong code is caught
// right there rather than only after also typing a new password -> new
// password + confirmation, submitted together against /api/auth/reset-
// password (which re-validates the same code server-side). Success drops
// back to Login so they sign in with the new password rather than trying
// to auto-log-in off a one-time reset code.
export default function ForgotPasswordScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [step, setStep] = useState<'email' | 'code' | 'password'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function requestReset() {
    if (!email.trim() || submitting) return;
    if (!EMAIL_RE.test(email.trim())) {
      setError('Enter a complete email address (e.g. name@gmail.com).');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const data = await authApi.forgotPassword(email.trim());
      setNotice(data.emailSent ? `Code sent to ${email.trim()}.` : null);
      setStep('code');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start a password reset.');
    } finally {
      setSubmitting(false);
    }
  }

  // Regenerates a fresh code (store.createResetToken overwrites the old
  // one, so the old code stops working the moment this fires) and resends
  // it to the same email - clearing whatever was typed so a since-
  // invalidated code can't accidentally be submitted.
  async function resendCode() {
    if (resending) return;
    setResending(true);
    setError(null);
    try {
      const data = await authApi.forgotPassword(email.trim());
      setCode('');
      setNotice(data.emailSent ? `New code sent to ${email.trim()}.` : null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resend the code.');
    } finally {
      setResending(false);
    }
  }

  async function verifyCode() {
    if (code.trim().length !== 6 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await authApi.verifyResetCode(code.trim());
      setNotice(null);
      setStep('password');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not verify that code.');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitNewPassword() {
    if (password.length < 6 || submitting) return;
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await authApi.resetPassword(code.trim(), password);
      setNotice('Password updated. Log in with your new password.');
      setTimeout(() => navigation.navigate('Login'), 900);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset your password.');
    } finally {
      setSubmitting(false);
    }
  }

  function goBack() {
    setError(null);
    if (step === 'password') setStep('code');
    else if (step === 'code') setStep('email');
    else navigation.goBack();
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.topRow, { marginTop: insets.top + 8 }]}>
        <BackButton onPress={goBack} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 'email' ? (
          <>
            <Text style={styles.title}>Reset password</Text>
            <Text style={styles.subtitle}>Enter your account email and we'll start a password reset.</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={requestReset}
            />
            <PrimaryButton title="Continue" onPress={requestReset} disabled={!email.trim()} loading={submitting} />
          </>
        ) : step === 'code' ? (
          <>
            <Text style={styles.title}>Enter your code</Text>
            <Text style={styles.subtitle}>We emailed a 6-digit code - it expires in 15 minutes.</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="6-digit code"
              placeholderTextColor={colors.textFaint}
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={setCode}
              onSubmitEditing={verifyCode}
            />
            <PrimaryButton title="Verify code" onPress={verifyCode} disabled={code.trim().length !== 6} loading={submitting} />
            <Pressable style={styles.resendRow} onPress={resendCode} disabled={resending} hitSlop={10}>
              <Text style={styles.resendText}>{resending ? 'Sending…' : "Didn't receive code?"}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.title}>New password</Text>
            <Text style={styles.subtitle}>Code verified - choose a new password.</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <PasswordInput
              placeholder="New password"
              autoComplete="password-new"
              value={password}
              onChangeText={setPassword}
            />
            <PasswordInput
              placeholder="Confirm new password"
              autoComplete="password-new"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              onSubmitEditing={submitNewPassword}
            />
            <PrimaryButton
              title="Reset password"
              onPress={submitNewPassword}
              disabled={password.length < 6 || confirmPassword.length < 6}
              loading={submitting}
            />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    topRow: {
      paddingHorizontal: 22,
    },
    content: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 28,
      paddingVertical: 24,
    },
    title: {
      fontSize: 24,
      fontFamily: fonts.displayBlack,
      color: colors.text,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 14,
      fontFamily: fonts.body,
      color: colors.textSoft,
      textAlign: 'center',
      marginTop: 6,
      marginBottom: 28,
      lineHeight: 20,
    },
    error: {
      color: colors.danger,
      fontFamily: fonts.bodySemiBold,
      fontSize: 13,
      textAlign: 'center',
      marginBottom: 14,
    },
    notice: {
      color: colors.success,
      fontFamily: fonts.bodySemiBold,
      fontSize: 13,
      textAlign: 'center',
      marginBottom: 14,
    },
    resendRow: {
      alignSelf: 'center',
      marginTop: 16,
    },
    resendText: {
      color: colors.primaryRed,
      fontFamily: fonts.bodySemiBold,
      fontSize: 13.5,
    },
    codeInput: {
      textAlign: 'center',
      fontSize: 24,
      letterSpacing: 8,
      fontFamily: fonts.displayBlack,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 15,
      fontFamily: fonts.body,
      color: colors.text,
      backgroundColor: colors.surface,
      marginBottom: 12,
    },
  });
}
