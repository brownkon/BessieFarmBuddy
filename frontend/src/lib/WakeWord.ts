import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';

const WAKE_WORD_STATUS_CHANGED_EVENT = 'wakeWordStatusChanged';

export type WakeWordStatus = {
  enabled: boolean;
  running: boolean;
  canRequestAssistantRole: boolean;
  assistantRoleHeld: boolean;
  ignoringBatteryOptimizations: boolean;
  hasOverlayPermission?: boolean;
};

export type WakeWordDetectedEvent = {
  nativeWakeTonePlayed?: boolean;
};

type WakeWordNativeModule = {
  startListening: () => Promise<boolean>;
  stopListening: () => Promise<boolean>;
  pauseListening?: () => Promise<boolean>;
  setWakeWordEnabled?: (enabled: boolean) => Promise<boolean>;
  setForegroundVoiceTabActive?: (active: boolean) => Promise<boolean>;
  getWakeWordStatus?: () => Promise<WakeWordStatus>;
  requestAssistantRole?: () => Promise<boolean>;
  openAssistantSettings?: () => Promise<boolean>;
  openBatteryOptimizationSettings?: () => Promise<boolean>;
  isIgnoringBatteryOptimizations?: () => Promise<boolean>;
  updateNotification?: (text: string) => Promise<boolean>;
  requestOverlayPermission?: () => Promise<boolean>;
  hasOverlayPermission?: () => Promise<boolean>;
  updateAssistantOverlayText?: (text: string) => Promise<boolean>;
  hideAssistantOverlay?: () => Promise<boolean>;
};

const LINKING_ERROR =
  `The package 'WakeWord' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

const WakeWord = (NativeModules.WakeWord as WakeWordNativeModule | undefined)
  ? NativeModules.WakeWord
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

export async function startListening(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    console.warn('WakeWord module is only supported on Android right now.');
    return false;
  }
  const didStart = await (WakeWord as WakeWordNativeModule).startListening();
  if (didStart) {
    DeviceEventEmitter.emit(WAKE_WORD_STATUS_CHANGED_EVENT);
  }
  return didStart;
}

export async function stopListening(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  const didStop = await (WakeWord as WakeWordNativeModule).stopListening();
  if (didStop) {
    DeviceEventEmitter.emit(WAKE_WORD_STATUS_CHANGED_EVENT);
  }
  return didStop;
}

export async function pauseListening(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  const module = WakeWord as WakeWordNativeModule;
  if (!module.pauseListening) {
    return false;
  }
  return await module.pauseListening();
}

export async function setWakeWordEnabled(enabled: boolean): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  const module = WakeWord as WakeWordNativeModule;
  if (!module.setWakeWordEnabled) {
    return false;
  }
  const didUpdate = await module.setWakeWordEnabled(enabled);
  if (didUpdate) {
    DeviceEventEmitter.emit(WAKE_WORD_STATUS_CHANGED_EVENT);
  }
  return didUpdate;
}

export async function setForegroundVoiceTabActive(active: boolean): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  const module = WakeWord as WakeWordNativeModule;
  if (!module.setForegroundVoiceTabActive) {
    return false;
  }
  return await module.setForegroundVoiceTabActive(active);
}

export async function getWakeWordStatus(): Promise<WakeWordStatus> {
  if (Platform.OS !== 'android') {
    return {
      enabled: false,
      running: false,
      canRequestAssistantRole: false,
      assistantRoleHeld: false,
      ignoringBatteryOptimizations: false,
    };
  }
  const module = WakeWord as WakeWordNativeModule;
  if (!module.getWakeWordStatus) {
    return {
      enabled: false,
      running: false,
      canRequestAssistantRole: false,
      assistantRoleHeld: false,
      ignoringBatteryOptimizations: false,
    };
  }
  return await module.getWakeWordStatus();
}

export async function requestAssistantRole(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  const module = WakeWord as WakeWordNativeModule;
  if (!module.requestAssistantRole) {
    return false;
  }
  return await module.requestAssistantRole();
}

export async function openAssistantSettings(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  const module = WakeWord as WakeWordNativeModule;
  if (!module.openAssistantSettings) {
    return false;
  }
  return await module.openAssistantSettings();
}

export async function openBatteryOptimizationSettings(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  const module = WakeWord as WakeWordNativeModule;
  if (!module.openBatteryOptimizationSettings) {
    return false;
  }
  return await module.openBatteryOptimizationSettings();
}

export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  const module = WakeWord as WakeWordNativeModule;
  if (!module.isIgnoringBatteryOptimizations) {
    return false;
  }
  return await module.isIgnoringBatteryOptimizations();
}

export function addWakeWordListener(callback: (event?: WakeWordDetectedEvent) => void) {
  return DeviceEventEmitter.addListener('onWakeWordDetected', callback);
}

export function addWakeWordStatusListener(callback: () => void) {
  return DeviceEventEmitter.addListener(WAKE_WORD_STATUS_CHANGED_EVENT, callback);
}

export async function updateNotification(text: string): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  const module = WakeWord as WakeWordNativeModule;
  if (!module.updateNotification) {
    return false;
  }
  return await module.updateNotification(text);
}

export async function requestOverlayPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const module = WakeWord as WakeWordNativeModule;
  if (!module.requestOverlayPermission) return false;
  return await module.requestOverlayPermission();
}

export async function hasOverlayPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const module = WakeWord as WakeWordNativeModule;
  if (!module.hasOverlayPermission) return false;
  return await module.hasOverlayPermission();
}

