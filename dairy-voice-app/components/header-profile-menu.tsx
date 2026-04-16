import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';

import { Fonts, IndustrialColors, IndustrialTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  addWakeWordStatusListener,
  getWakeWordStatus,
  setWakeWordEnabled,
  startListening as startWakeWord,
  stopListening as stopWakeWord,
} from '@/lib/WakeWord';
import { supabase } from '@/lib/supabase';

const BACKGROUND_MIC_PREF_KEY = 'dairyvoice.background_mic_enabled';

type WakePermissionResult = {
  granted: boolean;
  blocked: boolean;
  missing: string[];
};

async function ensureAndroidWakePermissions(): Promise<WakePermissionResult> {
  if (Platform.OS !== 'android') {
    return {
      granted: false,
      blocked: false,
      missing: ['microphone', 'notifications'],
    };
  }

  const missing: string[] = [];
  let blocked = false;

  const audioGranted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  if (audioGranted !== PermissionsAndroid.RESULTS.GRANTED) {
    missing.push('microphone');
    blocked = blocked || audioGranted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;
  }

  if (Platform.Version >= 33) {
    const notificationsGranted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    );
    if (notificationsGranted !== PermissionsAndroid.RESULTS.GRANTED) {
      missing.push('notifications');
      blocked = blocked || notificationsGranted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;
    }
  }

  return {
    granted: missing.length === 0,
    blocked,
    missing,
  };
}

async function disableWakeWordBestEffort() {
  try {
    await setWakeWordEnabled(false);
  } catch (error) {
    console.warn('Failed to disable wake word state', error);
  }

  try {
    await stopWakeWord();
  } catch (error) {
    console.warn('Failed to stop wake word service', error);
  }
}

async function hasAndroidWakePermissions() {
  if (Platform.OS !== 'android') {
    return false;
  }

  const hasAudio = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  if (!hasAudio) {
    return false;
  }

  if (Platform.Version >= 33) {
    const hasNotifications = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    if (!hasNotifications) {
      return false;
    }
  }

  return true;
}

async function ensureAndroidBackgroundLocationPermission() {
  if (Platform.OS !== 'android') {
    return true;
  }

  let foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) {
    foreground = await Location.requestForegroundPermissionsAsync();
  }

  if (!foreground.granted) {
    if (!foreground.canAskAgain) {
      Alert.alert(
        'Location permission blocked',
        'Location access is blocked in system settings. Enable location permission for Dairy Voice to attach GPS notes.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
        ]
      );
    }
    return false;
  }

  if (Platform.Version < 29) {
    return true;
  }

  const background = await Location.getBackgroundPermissionsAsync();
  if (background.granted) {
    return true;
  }

  Alert.alert(
    'Optional: background GPS notes',
    'GPS tagging while the app is closed needs Location set to "Allow all the time". You can continue without it and still use voice features.',
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => void Linking.openSettings() },
    ]
  );

  return false;
}

export function HeaderProfileMenu() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? IndustrialColors.dark : IndustrialColors.light;
  const fonts = Fonts;

  const [menuVisible, setMenuVisible] = useState(false);
  const [wakeWordEnabled, setWakeWordEnabledState] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [hydratingPreference, setHydratingPreference] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  const refreshWakeWordStatus = React.useCallback(async () => {
    if (Platform.OS !== 'android') {
      setWakeWordEnabledState(false);
      return;
    }

    try {
      const status = await getWakeWordStatus();
      setWakeWordEnabledState(status.enabled);
    } catch (error) {
      console.warn('Failed to refresh wake word status', error);
    }
  }, []);

  const onToggleWakeWord = React.useCallback(async (enabled: boolean) => {
    if (toggleLoading) {
      return;
    }

    if (Platform.OS !== 'android') {
      Alert.alert('Android only', 'Background assistant/mic is currently supported on Android only.');
      return;
    }

    const previousEnabled = wakeWordEnabled;
    setWakeWordEnabledState(enabled);
    setToggleLoading(true);
    try {
      if (enabled) {
        const permissionResult = await ensureAndroidWakePermissions();
        if (!permissionResult.granted) {
          const missingLabels = permissionResult.missing.join(' and ');
          if (permissionResult.blocked) {
            Alert.alert(
              'Permissions required',
              `Enable ${missingLabels} in Android settings to use the background listener.`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => void Linking.openSettings() },
              ]
            );
          } else {
            Alert.alert('Permissions required', 'Microphone and notifications are required for background listener.');
          }

          await disableWakeWordBestEffort();
          setWakeWordEnabledState(false);
          await AsyncStorage.setItem(BACKGROUND_MIC_PREF_KEY, 'false');
          await refreshWakeWordStatus();
          return;
        }

        const backgroundLocationGranted = await ensureAndroidBackgroundLocationPermission();
        if (!backgroundLocationGranted) {
          console.log('Background location not granted; continuing with background listener enabled and foreground-only GPS notes.');
        }

        await setWakeWordEnabled(true);
        const didStart = await startWakeWord();
        if (!didStart) {
          await disableWakeWordBestEffort();
          setWakeWordEnabledState(false);
          await AsyncStorage.setItem(BACKGROUND_MIC_PREF_KEY, 'false');
          Alert.alert(
            'Background assistant failed to start',
            'Wake word model is invalid or incomplete. Ensure android/app/src/main/assets/model contains a full Vosk model including a uuid file.'
          );
          await refreshWakeWordStatus();
          return;
        }
        await AsyncStorage.setItem(BACKGROUND_MIC_PREF_KEY, 'true');
      } else {
        await disableWakeWordBestEffort();
        setWakeWordEnabledState(false);
        await AsyncStorage.setItem(BACKGROUND_MIC_PREF_KEY, 'false');
      }

      await refreshWakeWordStatus();
    } catch (error) {
      console.error('Failed to update background listener', error);
      setWakeWordEnabledState(previousEnabled);
      Alert.alert('Update failed', 'Could not update background assistant/mic setting.');
    } finally {
      setToggleLoading(false);
    }
  }, [refreshWakeWordStatus, toggleLoading, wakeWordEnabled]);

  const onSignOut = React.useCallback(async () => {
    setSigningOut(true);
    const { error } = await supabase.auth.signOut();
    setSigningOut(false);

    if (error) {
      Alert.alert('Sign out failed', error.message);
    }
  }, []);

  useEffect(() => {
    void refreshWakeWordStatus();

    const sub = addWakeWordStatusListener(() => {
      void refreshWakeWordStatus();
    });

    return () => {
      sub.remove();
    };
  }, [refreshWakeWordStatus]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      setHydratingPreference(false);
      return;
    }

    async function hydrateBackgroundMicPreference() {
      try {
        const storedValue = await AsyncStorage.getItem(BACKGROUND_MIC_PREF_KEY);
        const currentStatus = await getWakeWordStatus();

        if (storedValue === null) {
          setWakeWordEnabledState(currentStatus.enabled);
          await AsyncStorage.setItem(BACKGROUND_MIC_PREF_KEY, currentStatus.enabled ? 'true' : 'false');
          return;
        }

        const shouldEnable = storedValue === 'true';
        if (!shouldEnable) {
          await setWakeWordEnabled(false);
          await stopWakeWord();
          setWakeWordEnabledState(false);
          return;
        }

        const permissionsGranted = await hasAndroidWakePermissions();
        if (!permissionsGranted) {
          // Keep persisted preference but avoid starting until permissions are available again.
          setWakeWordEnabledState(false);
          return;
        }

        await setWakeWordEnabled(true);
        const didStart = await startWakeWord();
        if (!didStart) {
          await setWakeWordEnabled(false);
          await stopWakeWord();
          setWakeWordEnabledState(false);
          return;
        }
        setWakeWordEnabledState(true);
      } catch (error) {
        console.warn('Failed to hydrate background mic preference', error);
      } finally {
        setHydratingPreference(false);
        await refreshWakeWordStatus();
      }
    }

    void hydrateBackgroundMicPreference();
  }, [refreshWakeWordStatus]);

  useEffect(() => {
    if (!menuVisible) {
      return;
    }

    void refreshWakeWordStatus();
  }, [menuVisible, refreshWakeWordStatus]);

  return (
    <View style={styles.anchor}>
      <TouchableOpacity
        onPress={() => setMenuVisible((prev) => !prev)}
        style={styles.profileIconBtn}
        accessibilityRole="button"
        accessibilityLabel="Open profile menu">
        <Ionicons name="person-circle-outline" size={31} color={palette.textPrimary} />
      </TouchableOpacity>

      {menuVisible ? (
        <View style={[styles.dropdownMenu, { backgroundColor: palette.plate, borderColor: palette.plateBorder }]}> 
          <TouchableOpacity
            style={styles.dropdownItem}
            onPress={() => {
              setMenuVisible(false);
              Alert.alert('Profile', 'Coming soon');
            }}>
            <Text style={[styles.dropdownText, { color: palette.textPrimary, fontFamily: fonts.condensedBold }]}>PROFILE</Text>
          </TouchableOpacity>

          <View style={[styles.toggleRow, { borderTopColor: palette.plateBorderSubtle, borderBottomColor: palette.plateBorderSubtle }]}>
            <Pressable
              style={styles.toggleTextWrap}
              onPress={() => {
                void onToggleWakeWord(!wakeWordEnabled);
              }}
              disabled={toggleLoading || hydratingPreference || Platform.OS !== 'android'}>
              <Text style={[styles.dropdownText, { color: palette.textPrimary, fontFamily: fonts.condensedBold }]}>BACKGROUND ASSISTANT / MIC</Text>
              <Text style={[styles.toggleHint, { color: palette.textMuted, fontFamily: fonts.condensed }]}> 
                {Platform.OS === 'android' ? 'When off, wake listener is fully stopped.' : 'Android only'}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.switchTrack,
                { backgroundColor: wakeWordEnabled ? palette.machineGreen : palette.steelGray },
                (toggleLoading || hydratingPreference || Platform.OS !== 'android') ? styles.switchDisabled : undefined,
              ]}
              onPress={() => {
                void onToggleWakeWord(!wakeWordEnabled);
              }}
              disabled={toggleLoading || hydratingPreference || Platform.OS !== 'android'}
              hitSlop={8}
              accessibilityRole="switch"
              accessibilityState={{ checked: wakeWordEnabled }}
              accessibilityLabel="Background assistant microphone toggle">
              <View
                style={[
                  styles.switchThumb,
                  wakeWordEnabled ? styles.switchThumbOn : styles.switchThumbOff,
                ]}
              />
            </Pressable>
          </View>

          <Pressable
            style={styles.dropdownItem}
            onPress={() => {
              setMenuVisible(false);
              void onSignOut();
            }}
            disabled={signingOut}>
            <Text style={[styles.dropdownText, { color: palette.danger, fontFamily: fonts.condensedBold }]}>SIGN OUT</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'relative',
    zIndex: 20,
  },
  profileIconBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 38,
    right: 0,
    borderRadius: IndustrialTheme.radius.card,
    borderWidth: IndustrialTheme.border.heavy,
    minWidth: 255,
    shadowColor: '#101418',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 6,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dropdownText: {
    fontSize: 13,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  toggleRow: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  toggleTextWrap: {
    flex: 1,
    paddingRight: 8,
  },
  toggleHint: {
    fontSize: 12,
    lineHeight: 14,
    marginTop: 3,
  },
  switchTrack: {
    width: 52,
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 2,
    justifyContent: 'center',
  },
  switchThumb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
  },
  switchThumbOff: {
    alignSelf: 'flex-start',
  },
  switchThumbOn: {
    alignSelf: 'flex-end',
  },
  switchDisabled: {
    opacity: 0.6,
  },
});
