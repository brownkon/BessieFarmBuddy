import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Fonts, IndustrialColors, IndustrialTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type NoticeTone = 'info' | 'success' | 'warning' | 'error';

type IndustrialNoticeProps = {
  title: string;
  message: string;
  tone?: NoticeTone;
};

function getToneColor(tone: NoticeTone, isDark: boolean) {
  const palette = isDark ? IndustrialColors.dark : IndustrialColors.light;

  switch (tone) {
    case 'success':
      return palette.machineGreen;
    case 'warning':
      return palette.signalAmber;
    case 'error':
      return palette.danger;
    case 'info':
    default:
      return palette.steelGray;
  }
}

export function IndustrialNotice({ title, message, tone = 'info' }: IndustrialNoticeProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? IndustrialColors.dark : IndustrialColors.light;
  const fonts = Fonts;
  const accent = getToneColor(tone, isDark);

  return (
    <View style={[styles.container, { backgroundColor: palette.surface, borderColor: palette.plateBorder }]}> 
      <View style={[styles.accent, { backgroundColor: accent }]} />
      <View style={styles.content}>
        <Text style={[styles.title, { color: palette.textPrimary, fontFamily: fonts.condensedBold }]}>{title}</Text>
        <Text style={[styles.message, { color: palette.textMuted, fontFamily: fonts.condensed }]}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: IndustrialTheme.border.heavy,
    borderRadius: IndustrialTheme.radius.card,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accent: {
    width: 6,
    alignSelf: 'stretch',
    borderRadius: 3,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  message: {
    fontSize: 14,
    lineHeight: 18,
  },
});
