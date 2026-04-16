import { Audio } from 'expo-av';
import * as Location from 'expo-location';
import { supabase } from '../services/supabase';
import { loadCachedGpsPayload, saveCachedGpsPayload } from './location-cache';
import { startVoiceStream, startEarlyCapture } from './voiceStreamClient';
import { resolveBackgroundBackendUrl } from './backend-url';
import * as WakeWord from './WakeWord';

const WAKE_SOUND = require('../../assets/sounds/transition_up.wav');
const SUBMIT_SOUND = require('../../assets/sounds/celebration.wav');
const ERROR_SOUND = require('../../assets/sounds/caution.wav');

function toGpsPayload(position) {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    captured_at: new Date(position.timestamp || Date.now()).toISOString(),
  };
}

async function playOneShotEffect(source, label) {
  try {
    const { sound } = await Audio.Sound.createAsync(source, { shouldPlay: true });

    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }

        settled = true;
        sound.setOnPlaybackStatusUpdate(null);
        resolve();
      };

      const timer = setTimeout(finish, 2500);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded || status.didJustFinish) {
          clearTimeout(timer);
          finish();
        }
      });
    });

    await sound.unloadAsync();
  } catch (error) {
    console.warn(`Failed to play ${label} sound`, error);
  }
}

async function getHeadlessGpsPayload() {
  try {
    const cachedPayload = await loadCachedGpsPayload();
    const backgroundPermission = await Location.getBackgroundPermissionsAsync();
    const foregroundPermission = await Location.getForegroundPermissionsAsync();

    if (!backgroundPermission.granted && !foregroundPermission.granted) {
      return cachedPayload || null;
    }

    const relaxedLastKnown = await Location.getLastKnownPositionAsync({
      maxAge: 24 * 60 * 60 * 1000,
    });

    if (relaxedLastKnown) {
      const payload = toGpsPayload(relaxedLastKnown);
      await saveCachedGpsPayload(payload).catch(() => {});
      return payload;
    }

    try {
      const locationPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        mayShowUserSettingsDialog: false,
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timed out waiting for GPS')), 15000);
      });

      const position = await Promise.race([locationPromise, timeoutPromise]);
      const payload = toGpsPayload(position);
      await saveCachedGpsPayload(payload).catch(() => {});
      return payload;
    } catch {
      return cachedPayload || null;
    }
  } catch (error) {
    console.warn('Headless GPS capture skipped for this request', error);
    return null;
  }
}

export default async function HeadlessVoiceTask(taskData = {}) {
  const nativeWakeTonePlayed = Boolean(taskData.nativeWakeTonePlayed);
  let earlyCapture = null;
  let backendUrlForDebug = '';

  try {
    await WakeWord.duckAudio();

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    earlyCapture = startEarlyCapture();

    await WakeWord.updateNotification('Listening for response...');
    await WakeWord.updateAssistantOverlayText('Listening...');

    if (!nativeWakeTonePlayed) {
      await playOneShotEffect(WAKE_SOUND, 'wake');
    }

    const backendUrl = await resolveBackgroundBackendUrl();
    backendUrlForDebug = backendUrl;

    if (!supabase) {
      throw new Error('Supabase client is unavailable in headless task.');
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userToken = session?.access_token;

    if (!userToken) {
      throw new Error('No user session available. Please sign in by opening the app.');
    }

    const transcriptResult = await startVoiceStream({
      backendUrl,
      token: userToken,
      timeoutMs: 15000,
      earlyCapture,
      onInterimText: async (text) => {
        await WakeWord.updateAssistantOverlayText(`YOU: ${text}`);
      },
    });

    if (!transcriptResult) {
      await WakeWord.updateAssistantOverlayText('No speech detected.');
      await playOneShotEffect(ERROR_SOUND, 'error');
      return;
    }

    await WakeWord.updateNotification('Sending to agent...');
    await WakeWord.updateAssistantOverlayText('Thinking...');
    await playOneShotEffect(SUBMIT_SOUND, 'submit');

    const gpsPayload = await getHeadlessGpsPayload();

    const response = await fetch(`${backendUrl}/api/voice-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        transcript: transcriptResult,
        source: 'voice',
        ...(gpsPayload || {}),
      }),
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.status}. ${responseText}`);
    }

    const data = JSON.parse(responseText || '{}');

    if (data.summary) {
      await WakeWord.updateNotification(`AI: ${data.summary}`);
      await WakeWord.updateAssistantOverlayText(`AI: ${data.summary}`);
    }

    if (data.audioBase64) {
      const { sound } = await Audio.Sound.createAsync(
        { uri: `data:audio/mp3;base64,${data.audioBase64}` },
        { shouldPlay: true }
      );

      await new Promise((resolve) => {
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            resolve();
          }
        });
      });

      await sound.unloadAsync();
    }
  } catch (error) {
    console.error('Headless Voice Task Error', {
      error,
      backendUrl: backendUrlForDebug || 'unresolved',
    });
    await WakeWord.updateAssistantOverlayText('Error connecting.');
    await playOneShotEffect(ERROR_SOUND, 'error');
  } finally {
    if (earlyCapture) {
      earlyCapture.stop();
    }

    await WakeWord.updateNotification("Listening for 'Hey Bessie'").catch(() => {});
    await WakeWord.releaseAudio().catch(() => {});

    // Keep compatibility with either method name while we phase in the native module.
    await WakeWord.resumeListening().catch(async () => {
      await WakeWord.resumeVosk().catch(() => {});
    });
  }
}
