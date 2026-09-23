import { ScrollView } from '../components/LiquidScroll';
import Pressable from '../components/LiquidPressable';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View,  } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AuthDivider from '../components/AuthDivider';
import BackButton from '../components/BackButton';
import Checkbox from '../components/Checkbox';
import FullScreenLoader from '../components/FullScreenLoader';
import GoogleButton from '../components/GoogleButton';
import LegalLinks from '../components/LegalLinks';
import PasswordInput from '../components/PasswordInput';
import PrimaryButton from '../components/PrimaryButton';
import { ApiError } from '../api/client';
import { loginWithGoogle } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { useGoogleSignIn } from '../hooks/useGoogleSignIn';
import type { AuthStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

// The backend session cookie already persists for 30 days regardless of
// this flag (there's no separate short-lived session mode) - "Remember me"
// instead controls whether this device's own credentials auto-fill the
// fields next time the Login screen is reached (e.g. after signing out),
// so returning here doesn't mean retyping everything. Email lives in
// AsyncStorage (not sensitive); the password lives in SecureStore, backed
// by Keychain/Keystore, never plain AsyncStorage.
const REMEMBERED_EMAIL_KEY = 'auth:rememberedEmail';
const REMEMBERED_PASSWORD_KEY = 'auth:rememberedPassword';

export default function LoginScreen({ navigation }: Props) {
  const { login, refresh } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(REMEMBERED_EMAIL_KEY),
      SecureStore.getItemAsync(REMEMBERED_PASSWORD_KEY).catch(() => null),
    ]).then(([savedEmail, savedPassword]) => {
      if (savedEmail) setEmail(savedEmail);
      if (savedPassword) setPassword(savedPassword);
    });
  }, []);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(email.trim(), password);
      if (rememberMe) {
        await Promise.all([
          AsyncStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim()),
          SecureStore.setItemAsync(REMEMBERED_PASSWORD_KEY, password).catch(() => {}),
        ]);
      } else {
        await Promise.all([
          AsyncStorage.removeItem(REMEMBERED_EMAIL_KEY),
          SecureStore.deleteItemAsync(REMEMBERED_PASSWORD_KEY).catch(() => {}),
        ]);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const google = useGoogleSignIn(
    async (idToken) => {
      setGoogleSubmitting(true);
      setError(null);
      try {
        await loginWithGoogle(idToken);
        await refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not sign in with Google.');
      } finally {
        setGoogleSubmitting(false);
      }
    },
    (message) => setError(message),
  );

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.topRow, { marginTop: insets.top + 8 }]}>
        <BackButton onPress={() => navigation.goBack()} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Image source={require('../../assets/mozart-logo.png')} style={styles.logo} />
        <Text style={styles.title}>Mozart Techniques</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

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
        />
        <PasswordInput
          placeholder="Password"
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={handleSubmit}
        />

        <View style={styles.rememberRow}>
          <Checkbox checked={rememberMe} onChange={setRememberMe} label="Remember me" />
          <Pressable onPress={() => navigation.navigate('ForgotPassword')} hitSlop={10}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>
        </View>

        <PrimaryButton title="Log in" onPress={handleSubmit} disabled={!canSubmit} loading={submitting} />

        <AuthDivider />
        <GoogleButton onPress={google.start} disabled={googleSubmitting} />

        <Pressable style={styles.linkRow} onPress={() => navigation.navigate('SignUp')}>
          <Text style={styles.linkText}>
            New here? <Text style={styles.linkTextStrong}>Create an account</Text>
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
      marginTop: 4,
      marginBottom: 28,
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
    rememberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 18,
      marginTop: 2,
    },
    forgotText: {
      color: colors.primaryRed,
      fontFamily: fonts.bodySemiBold,
      fontSize: 13,
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
