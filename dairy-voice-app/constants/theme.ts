/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

const industrialSafetyOrange = '#ff6a00';
const industrialSignalAmber = '#f0b429';
const industrialMachineGreen = '#1fa35b';
const industrialSteelGray = '#4f5d67';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const IndustrialColors = {
  light: {
    canvas: '#eceff1',
    surface: '#f8fafb',
    plate: '#ffffff',
    plateBorder: '#30383f',
    plateBorderSubtle: '#5c6872',
    textPrimary: '#1f2a33',
    textMuted: '#5b6670',
    safetyOrange: industrialSafetyOrange,
    signalAmber: industrialSignalAmber,
    machineGreen: industrialMachineGreen,
    steelGray: industrialSteelGray,
    danger: '#c7362f',
  },
  dark: {
    canvas: '#12181d',
    surface: '#1a2229',
    plate: '#202a31',
    plateBorder: '#7a8994',
    plateBorderSubtle: '#596774',
    textPrimary: '#e9eef2',
    textMuted: '#a9b6c0',
    safetyOrange: '#ff7f2a',
    signalAmber: '#f8c457',
    machineGreen: '#4cc979',
    steelGray: '#90a0ad',
    danger: '#f16b66',
  },
};

export const IndustrialTheme = {
  radius: {
    card: 8,
    control: 8,
    pill: 999,
  },
  border: {
    heavy: 2,
    standard: 1,
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 20,
    xl: 28,
  },
  motion: {
    snappyMs: 110,
    pulseFastMs: 850,
    pulseMediumMs: 1150,
    pulseSlowMs: 1450,
  },
  voiceStates: {
    listening: {
      accent: industrialSafetyOrange,
      glow: 'rgba(255, 106, 0, 0.28)',
      pulseMs: 850,
    },
    thinking: {
      accent: industrialSignalAmber,
      glow: 'rgba(240, 180, 41, 0.24)',
      pulseMs: 1450,
    },
    responding: {
      accent: industrialMachineGreen,
      glow: 'rgba(31, 163, 91, 0.24)',
      pulseMs: 1150,
    },
    idle: {
      accent: industrialSteelGray,
      glow: 'rgba(79, 93, 103, 0.18)',
      pulseMs: 0,
    },
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
    condensed: 'BarlowCondensed_500Medium',
    condensedBold: 'BarlowCondensed_700Bold',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
    condensed: 'BarlowCondensed_500Medium',
    condensedBold: 'BarlowCondensed_700Bold',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    condensed: "'Barlow Condensed', 'Arial Narrow', Impact, sans-serif",
    condensedBold: "'Barlow Condensed', 'Arial Narrow', Impact, sans-serif",
  },
}) ?? {
  sans: 'normal',
  serif: 'serif',
  rounded: 'normal',
  mono: 'monospace',
  condensed: 'BarlowCondensed_500Medium',
  condensedBold: 'BarlowCondensed_700Bold',
};
