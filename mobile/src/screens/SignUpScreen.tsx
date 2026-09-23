import { ScrollView } from '../components/LiquidScroll';
import Pressable from '../components/LiquidPressable';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View,  } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AuthDivider from '../components/AuthDivider';
import BackButton from '../components/BackButton';
import FullScreenLoader from '../components/FullScreenLoader';
import GoogleButton from '../components/GoogleButton';
import LegalLinks from '../components/LegalLinks';
import PasswordInput from '../components/PasswordInput';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter';
import PrimaryButton from '../components/PrimaryButton';
import * as authApi from '../api/auth';
import { ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useGoogleSignIn } from '../hooks/useGoogleSignIn';
import type { AuthStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

export default function SignUpScreen({ navigation }: Props) {
  const { refresh } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && email.trim().length > 0 && password.length >= 6 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await authApi.signup(name.trim(), email.trim(), password);
      // signup already signs the account in server-side (sets the session
      // cookie) - just re-read it so AuthContext picks up the new user and
      // App.tsx swaps to the Dashboard on its own.
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create your account. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const google = useGoogleSignIn(
    async (idToken) => {
      setGoogleSubmitting(true);
      setError(null);
      try {
        await authApi.loginWithGoogle(idToken);
        await refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not sign up with Google.');
      } finally {
        setGoogleSubmitting(false);
      }
    },
    (message) => setError(message),
  );

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.topRow, { marginTop: insets.top + 8 }]}>
        <BackButton onPress={() => navigation.goBack()} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Image source={require('../../assets/mozart-logo.png')} style={styles.logo} />
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Start with a short lesson and watch curiosity turn into confidence.</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TextInput
          style={styles.input}
          placeholder="Full name"
          placeholderTextColor={colors.textFaint}
          autoComplete="name"
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <PasswordInput
          placeholder="Password (at least 6 characters)"
          autoComplete="password-new"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={handleSubmit}
        />
        <PasswordStrengthMeter password={password} />

        <PrimaryButton title="Create account" onPress={handleSubmit} disabled={!canSubmit} loading={submitting} style={styles.button} />

        <AuthDivider />
        <GoogleButton onPress={google.start} disabled={googleSubmitting} />

        <Pressable style={styles.linkRow} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.linkText}>
            Already have an account? <Text style={styles.linkTextStrong}>Log in</Text>
          </Text>
        </Pressable>
        <LegalLinks />
      </ScrollView>
      {submitting ? <FullScreenLoader /> : null}
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
    logo: {
      width: 64,
      height: 64,
      borderRadius: 20,
      alignSelf: 'center',
      marginBottom: 14,
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
    button: {
      marginTop: 8,
    },
    linkRow: {
      marginTop: 20,
      alignItems: 'center',
    },
    linkText: {
      color: colors.textSoft,
      fontFamily: fonts.body,
      fontSize: 13,
    },
    linkTextStrong: {
      color: colors.primaryRed,
      fontFamily: fonts.bodyBold,
    },
  });
}
