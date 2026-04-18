import { Audio } from 'expo-av';
import * as Location from 'expo-location';
import { NativeModules } from 'react-native';
import { loadCachedGpsPayload, saveCachedGpsPayload } from './lib/location-cache';
import { supabase } from './services/supabase';
import { startVoiceStream, startEarlyCapture, EarlyCaptureHandle } from './lib/voiceStreamClient';

const { WakeWord } = NativeModules;

const WAKE_SOUND = require('../assets/sounds/transition_up.wav');
const SUBMIT_SOUND = require('../assets/sounds/celebration.wav');
const ERROR_SOUND = require('../assets/sounds/caution.wav');

type GpsPayload = {
  latitude: number;
  longitude: number;
  captured_at: string;
};

function toGpsPayload(position: { coords: { latitude: number; longitude: number }; timestamp?: number | null }): GpsPayload {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    captured_at: new Date(position.timestamp ?? Date.now()).toISOString(),
  };
}

async function playOneShotEffect(source: number, label: string) {
  try {
    const { sound } = await Audio.Sound.createAsync(source, { shouldPlay: true });

    // Wait for finish (with timeout fallback) so sound is audible before cleanup.
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        sound.setOnPlaybackStatusUpdate(null);
        resolve();
      };

      const timer = setTimeout(finish, 2500);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) {
          clearTimeout(timer);
          finish();
          return;
        }
        if (status.didJustFinish) {
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

async function getHeadlessGpsPayload(): Promise<GpsPayload | null> {
  try {
    const cachedPayload = await loadCachedGpsPayload();
    const backgroundPermission = await Location.getBackgroundPermissionsAsync();
    const foregroundPermission = await Location.getForegroundPermissionsAsync();

    if (!backgroundPermission.granted && !foregroundPermission.granted) {
      if (cachedPayload) {
        return cachedPayload;
      }
      console.warn('Headless GPS skipped: no location permission granted');
      return null;
    }

    const providerStatus = await Location.getProviderStatusAsync().catch(() => null);

    // Prefer cached location first so headless mode can still tag notes when a fresh fix is unavailable.
    const relaxedLastKnown = await Location.getLastKnownPositionAsync({
      maxAge: 24 * 60 * 60 * 1000,
    });

    if (relaxedLastKnown) {
      const payload = toGpsPayload(relaxedLastKnown);
      await saveCachedGpsPayload(payload).catch(() => {});
      return payload;
    }

    if (providerStatus && !providerStatus.locationServicesEnabled) {
      if (cachedPayload) {
        return cachedPayload;
      }
      console.warn('Headless GPS skipped: location services disabled and no last known position available');
      return null;
    }

    try {
      const locationPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        mayShowUserSettingsDialog: false,
      });

      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error('Timed out waiting for GPS')), 15000);
      });

      const position = await Promise.race([locationPromise, timeoutPromise]);
      const payload = toGpsPayload(position);
      await saveCachedGpsPayload(payload).catch(() => {});
      return payload;
    } catch (currentError) {
      // One extra fallback attempt in case provider started delivering a cached fix after wake-up.
      const fallbackLastKnown = await Location.getLastKnownPositionAsync({
        maxAge: 24 * 60 * 60 * 1000,
      });

      if (fallbackLastKnown) {
        const payload = toGpsPayload(fallbackLastKnown);
        await saveCachedGpsPayload(payload).catch(() => {});
        return payload;
      }

      if (cachedPayload) {
        return cachedPayload;
      }

      throw currentError;
    }
  } catch (error) {
    console.warn('Headless GPS capture skipped for this request', error);
    return null;
  }
}

export default async function HeadlessVoiceTask(taskData: any) {
  console.log('Headless JS Task started triggered by wake word:', taskData.wakeWord);
  const nativeWakeTonePlayed = Boolean(taskData?.nativeWakeTonePlayed);
  let earlyCapture: EarlyCaptureHandle | null = null;

  try {
    // Step A: Request explicit ducking from native system
    await WakeWord.duckAudio();

    // Prepare Expo AV for recording and background audio playback
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    // ── START MIC IMMEDIATELY ──
    // Begin capturing audio into an in-memory buffer RIGHT NOW, before the
    // WebSocket is open. This eliminates the 1-2 second gap that used to
    // clip the user's first sentence after the wake tone.
    earlyCapture = startEarlyCapture();
    
    // Update the system notification visibly to show it is now actively recording!
    if (WakeWord.updateNotification) {
        await WakeWord.updateNotification('Listening for response...');
    }
    if (WakeWord.updateAssistantOverlayText) {
        await WakeWord.updateAssistantOverlayText('Listening...');
    }

    if (!nativeWakeTonePlayed) {
      await playOneShotEffect(WAKE_SOUND, 'wake');
      console.log('Played wake sound effect.');
    } else {
      console.log('Native wake tone already played; skipping JS wake sound.');
    }

    // Resolve backend URL and auth token early — needed for WebSocket connection
    // 10.0.2.2 maps exactly to the host machine's localhost when running in the Android Emulator
    const backendUrl = (process.env.EXPO_PUBLIC_BACKEND_URL || 'http://10.0.2.2:3000').replace(/\/+$/, '');

    const { data: { session } } = await supabase.auth.getSession();
    const userToken = session?.access_token;

    if (!userToken) {
        throw new Error('No user session available. Please sign in opening the app.');
    }

    // Step B: Stream audio to backend via WebSocket for Deepgram STT
    // The mic is already capturing (via earlyCapture). startVoiceStream will
    // flush all buffered audio once the WebSocket connects, then continue
    // streaming live.
    console.log('Starting WebSocket audio stream to backend...');
    const transcriptResult = await startVoiceStream({
      backendUrl,
      token: userToken,
      onInterimText: async (text: string) => {
        if (WakeWord.updateAssistantOverlayText) {
          await WakeWord.updateAssistantOverlayText(`YOU: ${text}`);
        }
      },
      timeoutMs: 15000,
      earlyCapture: earlyCapture ?? undefined,
    });

    console.log('Transcription finished, Text:', transcriptResult);

    if (transcriptResult) {
      // Step C: Send textual Transcript to Backend LLM
      console.log('Uploading query to backend...');
      if (WakeWord.updateNotification) {
        await WakeWord.updateNotification('Sending to agent...');
      }
      if (WakeWord.updateAssistantOverlayText) {
        await WakeWord.updateAssistantOverlayText('Thinking...');
      }
      await playOneShotEffect(SUBMIT_SOUND, 'submit');

      console.log(`Sending Background Request to: ${backendUrl}/api/voice-chat`);
      console.log(`Payload string: "${transcriptResult}"`);

      const gpsPayload = await getHeadlessGpsPayload();

      // Switch to the main json-based /api/voice-chat endpoint utilized by the frontend
      const response = await fetch(`${backendUrl}/api/voice-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          transcript: transcriptResult,
          source: 'voice',
          ...(gpsPayload ?? {}),
        }),
      });

      const responseText = await response.text();

      if (!response.ok) {
        console.error(`Backend Error [HTTP ${response.status}]:`, responseText);
        throw new Error(`Network response was not ok: ${response.status}. Details: ${responseText}`);
      }

      // Parse JSON manually from our buffered text
      const data = JSON.parse(responseText);
      
      console.log('Response received, playing audio LLM answer. Status:', response.ok);

      // Step D: Playback LLM audio response while screen locked
      if (data.summary) {
          if (WakeWord.updateNotification) {
              await WakeWord.updateNotification('AI: ' + data.summary);
          }
          if (WakeWord.updateAssistantOverlayText) {
            await WakeWord.updateAssistantOverlayText(`AI: ${data.summary}`);
          }
      }

      if (data.audioBase64) {
        const { sound: responseSound } = await Audio.Sound.createAsync(
          { uri: `data:audio/mp3;base64,${data.audioBase64}` },
          { shouldPlay: true }
        );
        
        // Wait until it finishes playing
        await new Promise((resolve, reject) => {
          responseSound.setOnPlaybackStatusUpdate((status) => {
            if (status.isLoaded && status.didJustFinish) {
              resolve(true);
            }
          });
        });
        
        await responseSound.unloadAsync();
      }
    } else {
      if (WakeWord.updateAssistantOverlayText) {
        await WakeWord.updateAssistantOverlayText('No speech detected.');
      }
      await playOneShotEffect(ERROR_SOUND, 'error');
    }

  } catch (error) {
    console.error('Headless Voice Task Error:', error);
    // Make sure the early capture mic is stopped on error
    if (earlyCapture) {
      earlyCapture.stop();
      earlyCapture = null;
    }
    if (WakeWord.updateAssistantOverlayText) {
        await WakeWord.updateAssistantOverlayText('Error connecting.');
    }
    await playOneShotEffect(ERROR_SOUND, 'error');
  } finally {
    // Step E: Reset Vosk Wake Word listener & Release ducking
    console.log('Restoring Audio Focus and Resuming Vosk listener...');
    try {
      if (WakeWord.updateNotification) {
        await WakeWord.updateNotification("Listening for 'Hey Bovi / Ok Bovi'");
      }
      await WakeWord.releaseAudio();
      await WakeWord.resumeVosk();
    } catch (e) {
      console.error('Failed to cleanup native audio state', e);
    }
  }
}
