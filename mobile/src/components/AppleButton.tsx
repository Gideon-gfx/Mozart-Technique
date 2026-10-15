import React, { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';

import { API_BASE_URL } from '../api/client';

// The native button is iOS-only. Do not load its module on Android, where
// Expo's AppleAuthentication SDK does not provide a native sign-in flow.
let Apple: typeof import('expo-apple-authentication') | null = null;
if (Platform.OS === 'ios') {
  try {
    Apple = require('expo-apple-authentication');
  } catch {
    Apple = null;
  }
}

interface Props {
  onCredential: (authorizationCode: string, name: string) => Promise<void>;
  onTicket: (ticket: string, verifier: string) => Promise<void>;
  onError: (message: string) => void;
  disabled?: boolean;
}

export default function AppleButton({ onCredential, onTicket, onError, disabled }: Props) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE_URL}/api/config`)
      .then((response) => response.json())
      .then(async (config) => {
        const supported = Platform.OS === 'ios'
          ? Boolean(Apple && config.appleNativeEnabled && await Apple.isAvailableAsync())
          : Platform.OS === 'android' && Boolean(config.appleWebEnabled);
        if (active) setAvailable(supported);
      })
      .catch(() => { if (active) setAvailable(false); });
    return () => { active = false; };
  }, []);

  if (!available) return null;

  async function startAndroid() {
    if (disabled) return;
    try {
      const verifier = Array.from(Crypto.getRandomBytes(32), (byte) => byte.toString(16).padStart(2, '0')).join('');
      const challenge = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier);
      const returnUrl = 'mozarttechniques://auth/apple';
      const result = await WebBrowser.openAuthSessionAsync(
        `${API_BASE_URL}/api/auth/apple/start?platform=android&challenge=${challenge}`,
        returnUrl,
      );
      if (result.type !== 'success') return;
      const url = new URL(result.url);
      if (url.protocol !== 'mozarttechniques:' || url.host !== 'auth' || url.pathname !== '/apple') {
        onError('Apple sign-in returned to an unexpected address.');
        return;
      }
      const ticket = url.searchParams.get('ticket');
      if (!ticket) {
        onError('Apple sign-in was not completed. Please try again.');
        return;
      }
      await onTicket(ticket, verifier);
    } catch {
      onError('Could not sign in with Apple. Please try again.');
    }
  }

  async function start() {
    if (!Apple || disabled) return;
    try {
      const credential = await Apple.signInAsync({
        requestedScopes: [Apple.AppleAuthenticationScope.FULL_NAME, Apple.AppleAuthenticationScope.EMAIL],
      });
      if (!credential.authorizationCode) {
        onError('Apple did not return an authorization code. Please try again.');
        return;
      }
      const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
      await onCredential(credential.authorizationCode, name);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_REQUEST_CANCELED') return;
      onError('Could not sign in with Apple. Please try again.');
    }
  }

  if (Platform.OS === 'android') {
    return (
      <Pressable
        onPress={startAndroid}
        disabled={disabled}
        style={{ marginTop: 12, height: 48, borderRadius: 12, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, opacity: disabled ? 0.5 : 1 }}
        accessibilityRole="button"
        accessibilityLabel="Continue with Apple"
      >
        <FontAwesome5 name="apple" size={18} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Continue with Apple</Text>
      </Pressable>
    );
  }

  if (!Apple) return null;
  return (
    <View style={{ marginTop: 12 }}>
      <Apple.AppleAuthenticationButton
        buttonType={Apple.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={Apple.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={12}
        style={{ width: '100%', height: 48 }}
        onPress={start}
      />
    </View>
  );
}
