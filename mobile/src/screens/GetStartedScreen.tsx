import Pressable from '../components/LiquidPressable';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';

import PrimaryButton from '../components/PrimaryButton';
import type { AuthStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<AuthStackParamList, 'GetStarted'>;

const INTRO_MESSAGE = 'Play. Learn. Grow.';
const TYPE_SPEED_MS = 55;

// The pale pastel stops read as a glassy prism against the dark theme's
// near-black background, but the same pale colors nearly disappear against
// the light theme's white/cream background - barely more contrast than
// white-on-white. Deep jewel tones keep the same rainbow progression
// (blue -> purple -> pink -> gold) with real contrast on a light ground.
const RAINBOW_STOPS_DARK_THEME = [
  { offset: '0', color: '#F9FCFF' },
  { offset: '0.2', color: '#B8E5FF' },
  { offset: '0.46', color: '#F2B9FF' },
  { offset: '0.72', color: '#FFB7C5' },
  { offset: '1', color: '#FFF0B5' },
];
const RAINBOW_STOPS_LIGHT_THEME = [
  { offset: '0', color: '#1B3A6B' },
  { offset: '0.2', color: '#1D6FA5' },
  { offset: '0.46', color: '#7A2E8C' },
  { offset: '0.72', color: '#C42558' },
  { offset: '1', color: '#B8790B' },
];

// Reached after Splash -> Onboarding, so this is purely the "what do you
// want to do" decision point - no more pitch content here, that's what the
// carousel just covered. No device mockup here (that's the carousel's job) -
// just a typewriter-animated intro line.
export default function GetStartedScreen({ navigation }: Props) {
  const { colors, scheme } = useTheme();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [typed, setTyped] = useState('');
  const rainbowStops = scheme === 'light' ? RAINBOW_STOPS_LIGHT_THEME : RAINBOW_STOPS_DARK_THEME;
  const strokeColor = scheme === 'light' ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.42)';

  useEffect(() => {
    const chars = Array.from(INTRO_MESSAGE);
    setTyped('');
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setTyped(chars.slice(0, i).join(''));
      if (i >= chars.length) clearInterval(id);
    }, TYPE_SPEED_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <Image source={require('../../assets/mozart-logo.png')} style={styles.logo} />
        <Text style={styles.title}>Let's get started</Text>
        <Text style={styles.subtitle}>Sign in to your account, or create a new one to begin.</Text>
        <View style={styles.introRow} accessibilityLabel={INTRO_MESSAGE}>
          <Svg width={width - 72} height={72}>
            <Defs>
              <LinearGradient id="getStartedRainbow" x1="0" y1="0" x2="1" y2="1">
                {rainbowStops.map((stop) => (
                  <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
                ))}
              </LinearGradient>
              <LinearGradient id="getStartedGloss" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.92" />
                <Stop offset="0.48" stopColor="#FFFFFF" stopOpacity="0.08" />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <SvgText
              x="50%"
              y="47"
              fill="url(#getStartedRainbow)"
              stroke={strokeColor}
              strokeWidth="0.55"
              textAnchor="middle"
              fontFamily={fonts.displayBlack}
              fontSize="29"
              letterSpacing="-0.8"
            >
              {typed}
            </SvgText>
            <SvgText
              x="50%"
              y="47"
              fill="url(#getStartedGloss)"
              textAnchor="middle"
              fontFamily={fonts.displayBlack}
              fontSize="29"
              letterSpacing="-0.8"
            >
              {typed}
            </SvgText>
          </Svg>
        </View>
      </View>

      <View style={styles.actions}>
        <PrimaryButton title="Create an account" onPress={() => navigation.navigate('SignUp')} />
        <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.secondaryButtonText}>Log in</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: 'space-between',
      paddingHorizontal: 28,
      paddingTop: 60,
      paddingBottom: 40,
    },
    hero: {
      alignItems: 'center',
    },
    introRow: {
      marginTop: 28,
      minHeight: 72,
      alignItems: 'center',
    },
    logo: {
      width: 64,
      height: 64,
      borderRadius: 18,
      marginBottom: 18,
    },
    title: {
      fontSize: 30,
      fontFamily: fonts.displayBlack,
      color: colors.text,
      textAlign: 'center',
      letterSpacing: -0.8,
      marginBottom: 10,
    },
    subtitle: {
      fontSize: 15,
      lineHeight: 22,
      fontFamily: fonts.body,
      color: colors.textSoft,
      textAlign: 'center',
    },
    actions: {
      gap: 12,
    },
    secondaryButton: {
      borderRadius: 999,
      paddingVertical: 16,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    secondaryButtonText: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      fontSize: 15,
    },
  });
}
