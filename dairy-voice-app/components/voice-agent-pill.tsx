import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Image,
  ImageSourcePropType,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Fonts, IndustrialColors, IndustrialTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type VoiceAgentState = 'idle' | 'listening' | 'thinking' | 'responding';

type VoiceAgentPillProps = {
  state: VoiceAgentState;
  userText: string;
  aiText: string;
  actionLabel: string;
  onActionPress: () => void;
  actionDisabled?: boolean;
  mascotSource: ImageSourcePropType;
};

function getStateAccent(state: VoiceAgentState, isDark: boolean) {
  const palette = isDark ? IndustrialColors.dark : IndustrialColors.light;

  switch (state) {
    case 'listening':
      return {
        color: palette.safetyOrange,
        glow: 'rgba(255, 106, 0, 0.28)',
        pulseMs: IndustrialTheme.motion.pulseFastMs,
      };
    case 'thinking':
      return {
        color: palette.signalAmber,
        glow: 'rgba(240, 180, 41, 0.24)',
        pulseMs: IndustrialTheme.motion.pulseSlowMs,
      };
    case 'responding':
      return {
        color: palette.machineGreen,
        glow: 'rgba(31, 163, 91, 0.24)',
        pulseMs: IndustrialTheme.motion.pulseMediumMs,
      };
    case 'idle':
    default:
      return {
        color: palette.steelGray,
        glow: 'rgba(79, 93, 103, 0.18)',
        pulseMs: 0,
      };
  }
}

function getStateLabel(state: VoiceAgentState) {
  switch (state) {
    case 'listening':
      return 'LISTENING';
    case 'thinking':
      return 'THINKING';
    case 'responding':
      return 'RESPONDING';
    case 'idle':
    default:
      return 'READY';
  }
}

export function VoiceAgentPill({
  state,
  userText,
  aiText,
  actionLabel,
  onActionPress,
  actionDisabled = false,
  mascotSource,
}: VoiceAgentPillProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? IndustrialColors.dark : IndustrialColors.light;
  const fonts = Fonts;
  const pulse = useRef(new Animated.Value(0)).current;

  const accent = useMemo(() => getStateAccent(state, isDark), [state, isDark]);

  useEffect(() => {
    pulse.stopAnimation();
    pulse.setValue(0);

    if (!accent.pulseMs) {
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: Math.round(accent.pulseMs / 2),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: Math.round(accent.pulseMs / 2),
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => {
      animation.stop();
    };
  }, [accent.pulseMs, pulse]);

  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.12],
  });

  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.68],
  });

  const handleActionPress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(
        Platform.OS === 'ios' ? Haptics.ImpactFeedbackStyle.Rigid : Haptics.ImpactFeedbackStyle.Medium
      );
    }
    onActionPress();
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.mascotDock}>
        <Animated.View
          style={[
            styles.mascotPulseRing,
            {
              borderColor: accent.color,
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />
        <View style={[styles.mascotFrame, { borderColor: accent.color, shadowColor: accent.glow }]}> 
          <Image source={mascotSource} style={styles.mascotImage} resizeMode="cover" />
        </View>
      </View>

      <View style={styles.pillWrap}>
        <Animated.View
          style={[
            styles.pillPulseRing,
            {
              borderColor: accent.color,
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />
        <View style={[styles.pill, { backgroundColor: palette.plate, borderColor: palette.plateBorder }]}> 
          <View style={styles.pillHeader}>
            <Text style={[styles.statusLabel, { color: accent.color, fontFamily: fonts.condensedBold }]}>
              {getStateLabel(state)}
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                {
                  borderColor: accent.color,
                  backgroundColor: pressed ? accent.color : 'transparent',
                  opacity: actionDisabled ? 0.55 : 1,
                },
              ]}
              onPress={handleActionPress}
              disabled={actionDisabled}>
              <Text style={[styles.actionText, { color: actionDisabled ? palette.textMuted : accent.color, fontFamily: fonts.condensedBold }]}> 
                {actionLabel}
              </Text>
            </Pressable>
          </View>

          <View style={[styles.lineItem, { borderColor: palette.plateBorderSubtle }]}> 
            <Text style={[styles.lineLabel, { color: palette.textMuted, fontFamily: fonts.condensedBold }]}>YOU</Text>
            <Text numberOfLines={2} style={[styles.lineValue, { color: palette.textPrimary, fontFamily: fonts.condensed }]}> 
              {userText || 'Say a command to your dairy agent'}
            </Text>
          </View>

          <View style={[styles.lineItem, { borderColor: palette.plateBorderSubtle }]}> 
            <Text style={[styles.lineLabel, { color: palette.textMuted, fontFamily: fonts.condensedBold }]}>AGENT</Text>
            <Text numberOfLines={3} style={[styles.lineValue, { color: palette.textPrimary, fontFamily: fonts.condensed }]}> 
              {aiText || 'Response will appear here'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 48,
  },
  mascotDock: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    width: 92,
    height: 92,
    zIndex: 3,
  },
  mascotPulseRing: {
    position: 'absolute',
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: IndustrialTheme.border.heavy,
  },
  mascotFrame: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: IndustrialTheme.border.heavy,
    backgroundColor: '#dbe1e5',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  mascotImage: {
    width: '100%',
    height: '100%',
  },
  pillWrap: {
    width: '100%',
    alignItems: 'center',
  },
  pillPulseRing: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderRadius: IndustrialTheme.radius.card + 2,
    borderWidth: IndustrialTheme.border.heavy,
  },
  pill: {
    width: '100%',
    borderWidth: IndustrialTheme.border.heavy,
    borderRadius: IndustrialTheme.radius.card,
    paddingHorizontal: 14,
    paddingTop: 38,
    paddingBottom: 14,
    gap: 10,
  },
  pillHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  statusLabel: {
    fontSize: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  actionButton: {
    borderWidth: IndustrialTheme.border.heavy,
    borderRadius: IndustrialTheme.radius.control,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionText: {
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  lineItem: {
    borderWidth: 1,
    borderRadius: IndustrialTheme.radius.control,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  lineLabel: {
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  lineValue: {
    fontSize: 16,
    lineHeight: 20,
  },
});
