import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { NativeModules } from 'react-native';
import { supabase } from './services/supabase';
import { startVoiceStream, startEarlyCapture, EarlyCaptureHandle } from './lib/voiceStreamClient';

const { WakeWord } = NativeModules;

const WAKE_SOUND = require('../assets/sounds/transition_up.wav');
const SUBMIT_SOUND = require('../assets/sounds/celebration.wav');
const ERROR_SOUND = require('../assets/sounds/caution.wav');
const ENABLE_WEBSOCKET_STT = false;
const FALLBACK_RECORDING_MS = 5000;

type GpsPayload = {
  latitude: number;
  longitude: number;
  captured_at: string;
};

type SseParseResult = {
  transcript: string;
  summary: string;
};

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
  // GPS is intentionally disabled for now to avoid permission prompts and
  // background delays while stabilizing wake->response behavior.
  return null;
}

function parseSseResponse(rawResponse: string): SseParseResult {
  const lines = rawResponse.split('\n');
  let transcript = '';
  let summary = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) continue;

    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;

    try {
      const parsed = JSON.parse(payload) as { transcript?: string; content?: string };
      if (typeof parsed.transcript === 'string' && parsed.transcript.trim()) {
        transcript = parsed.transcript.trim();
      }
      if (typeof parsed.content === 'string' && parsed.content.trim()) {
        summary += parsed.content;
      }
    } catch {
      // Ignore malformed SSE chunks and keep parsing the rest.
    }
  }

  return { transcript, summary: summary.trim() };
}

async function speakResponseText(text: string) {
  if (!text.trim()) return;

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const timeoutMs = Math.min(14000, Math.max(3500, text.length * 70));
    const timeout = setTimeout(finish, timeoutMs);

    try {
      Speech.stop();
      Speech.speak(text, {
        rate: 0.98,
        pitch: 1.0,
        onDone: () => {
          clearTimeout(timeout);
          finish();
        },
        onError: () => {
          clearTimeout(timeout);
          finish();
        },
      });
    } catch {
      clearTimeout(timeout);
      finish();
    }
  });
}

async function recordFallbackCommandAudio(durationMs = 6500): Promise<string> {
  const recording = new Audio.Recording();
  const options = {
    android: {
      extension: '.m4a',
      outputFormat: Audio.AndroidOutputFormat.MPEG_4,
      audioEncoder: Audio.AndroidAudioEncoder.AAC,
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 64000,
      isMeteringEnabled: false,
    },
    ios: {
      extension: '.m4a',
      audioQuality: Audio.IOSAudioQuality.MEDIUM,
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 64000,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
      isMeteringEnabled: false,
    },
  };

  await recording.prepareToRecordAsync(options);
  await recording.startAsync();
  await new Promise((resolve) => setTimeout(resolve, durationMs));
  await recording.stopAndUnloadAsync();

  const uri = recording.getURI();
  if (!uri) {
    throw new Error('Fallback recording completed without an audio URI.');
  }
  return uri;
}

async function uploadAudioToVoiceChat(
  backendUrl: string,
  userToken: string,
  audioUri: string,
  gpsPayload: GpsPayload | null,
): Promise<SseParseResult> {
  const formData = new FormData();
  formData.append('audio', {
    uri: audioUri,
    type: 'audio/m4a',
    name: 'command.m4a',
  } as any);
  formData.append('language', 'en');
  formData.append('history', JSON.stringify([]));
  if (gpsPayload) {
    formData.append('location', JSON.stringify(gpsPayload));
  }

  const response = await fetch(`${backendUrl}/api/voice-chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${userToken}`,
    },
    body: formData,
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Voice chat upload failed [HTTP ${response.status}]: ${responseText}`);
  }

  return parseSseResponse(responseText);
}

async function sendTranscriptToChat(
  backendUrl: string,
  userToken: string,
  transcript: string,
  gpsPayload: GpsPayload | null,
): Promise<string> {
  const response = await fetch(`${backendUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      text: transcript,
      language: 'en',
      history: [],
      ...(gpsPayload ? { location: gpsPayload } : {}),
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Chat request failed [HTTP ${response.status}]: ${responseText}`);
  }

  return parseSseResponse(responseText).summary;
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

    let gpsPayload: GpsPayload | null = null;
    let transcriptResult = '';
    let assistantSummary = '';

    // Step B: WebSocket STT endpoint is currently unavailable on backend, so
    // we skip retry delays and go straight to direct upload transcription.
    if (ENABLE_WEBSOCKET_STT) {
      console.log('Starting WebSocket audio stream to backend...');
      try {
        transcriptResult = await startVoiceStream({
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
      } catch (streamError) {
        const message = streamError instanceof Error ? streamError.message : String(streamError);
        console.warn('[VoiceStream] Falling back to direct audio upload flow:', message);
      }
    }

    if (!transcriptResult) {
      if (earlyCapture) {
        earlyCapture.stop();
        earlyCapture = null;
      }

      if (WakeWord.updateNotification) {
        await WakeWord.updateNotification('Recording command...');
      }
      if (WakeWord.updateAssistantOverlayText) {
        await WakeWord.updateAssistantOverlayText('Listening...');
      }

      gpsPayload = await getHeadlessGpsPayload();
      const fallbackAudioUri = await recordFallbackCommandAudio(FALLBACK_RECORDING_MS);
      const fallbackResult = await uploadAudioToVoiceChat(
        backendUrl,
        userToken,
        fallbackAudioUri,
        gpsPayload,
      );

      transcriptResult = fallbackResult.transcript;
      assistantSummary = fallbackResult.summary;
    }

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

      console.log(`Sending Background Request to: ${backendUrl}/api/chat`);
      console.log(`Payload string: "${transcriptResult}"`);

      if (!gpsPayload) {
        gpsPayload = await getHeadlessGpsPayload();
      }

      if (!assistantSummary) {
        assistantSummary = await sendTranscriptToChat(
          backendUrl,
          userToken,
          transcriptResult,
          gpsPayload,
        );
      }

      // Step D: Playback LLM response while screen locked
      if (assistantSummary) {
        if (WakeWord.updateNotification) {
          await WakeWord.updateNotification('AI: ' + assistantSummary);
        }
        if (WakeWord.updateAssistantOverlayText) {
          await WakeWord.updateAssistantOverlayText(`AI: ${assistantSummary}`);
        }

        await speakResponseText(assistantSummary);
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
        await WakeWord.updateNotification("Listening for 'Hey Bessie / Ok Bessie'");
      }
      await WakeWord.releaseAudio();
      await WakeWord.resumeVosk();
    } catch (e) {
      console.error('Failed to cleanup native audio state', e);
    }
  }
}
