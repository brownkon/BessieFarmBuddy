import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';

const WAKE_WORD_STATUS_CHANGED_EVENT = 'wakeWordStatusChanged';

const WakeWordModule = NativeModules.WakeWord;

function isAndroidWakeModuleAvailable() {
  return Platform.OS === 'android' && !!WakeWordModule;
}

async function call(methodName, ...args) {
  if (!isAndroidWakeModuleAvailable()) {
    return false;
  }

  const method = WakeWordModule[methodName];
  if (typeof method !== 'function') {
    return false;
  }

  return await method(...args);
}

export async function startListening() {
  const didStart = await call('startListening');
  if (didStart) {
    DeviceEventEmitter.emit(WAKE_WORD_STATUS_CHANGED_EVENT);
  }
  return Boolean(didStart);
}

export async function stopListening() {
  const didStop = await call('stopListening');
  if (didStop) {
    DeviceEventEmitter.emit(WAKE_WORD_STATUS_CHANGED_EVENT);
  }
  return Boolean(didStop);
}

export async function setWakeWordEnabled(enabled) {
  const didUpdate = await call('setWakeWordEnabled', enabled);
  if (didUpdate) {
    DeviceEventEmitter.emit(WAKE_WORD_STATUS_CHANGED_EVENT);
  }
  return Boolean(didUpdate);
}

export async function setForegroundVoiceTabActive(active) {
  return Boolean(await call('setForegroundVoiceTabActive', active));
}

export async function getWakeWordStatus() {
  if (!isAndroidWakeModuleAvailable() || typeof WakeWordModule.getWakeWordStatus !== 'function') {
    return {
      enabled: false,
      running: false,
      ignoringBatteryOptimizations: false,
      hasOverlayPermission: false,
    };
  }

  return await WakeWordModule.getWakeWordStatus();
}

export async function resumeListening() {
  const didResume = await call('resumeListening');
  if (didResume) {
    DeviceEventEmitter.emit(WAKE_WORD_STATUS_CHANGED_EVENT);
  }
  return Boolean(didResume);
}

// Backwards-compatible alias with the dairy task naming.
export async function resumeVosk() {
  return await resumeListening();
}

export async function duckAudio() {
  return Boolean(await call('duckAudio'));
}

export async function releaseAudio() {
  return Boolean(await call('releaseAudio'));
}

export async function updateNotification(text) {
  return Boolean(await call('updateNotification', text));
}

export async function requestOverlayPermission() {
  return Boolean(await call('requestOverlayPermission'));
}

export async function hasOverlayPermission() {
  return Boolean(await call('hasOverlayPermission'));
}

export async function updateAssistantOverlayText(text) {
  return Boolean(await call('updateAssistantOverlayText', text));
}

export async function hideAssistantOverlay() {
  return Boolean(await call('hideAssistantOverlay'));
}

export function addWakeWordListener(callback) {
  return DeviceEventEmitter.addListener('onWakeWordDetected', callback);
}

export function addWakeWordStatusListener(callback) {
  return DeviceEventEmitter.addListener(WAKE_WORD_STATUS_CHANGED_EVENT, callback);
}
