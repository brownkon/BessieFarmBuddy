import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Platform, LogBox, Modal, FlatList, Pressable, ScrollView, Alert, NativeModules, NativeEventEmitter, PermissionsAndroid, Animated } from 'react-native';
import { registerRootComponent } from 'expo';
import * as Vosk from 'react-native-vosk';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';

// --- CONFIGURATION ---
const WAKE_PHRASES = ['hey dairy', 'hey dearie', 'hey deairy', 'hey bessie', 'hey bessy', 'hey dary', 'bessie'];
const EXIT_PHRASES = ['thank you', 'stop', 'bye', 'goodbye', 'thanks', 'dismissed', 'stop dialogue', 'stop talking', 'cancel', 'finished', 'done'];
const configuredBackendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://144.39.117.142:3000';
const getBackendCandidates = () => [
  configuredBackendUrl,
  'http://localhost:3000',
];

const LANGUAGES = [
  { label: '🇺🇸 English', code: 'en', voicePrefix: 'en' },
  { label: '🇲🇽 Spanish', code: 'es', voicePrefix: 'es' },
];

export default function App() {
  const [status, setStatus] = useState('Initializing...');
  const [serverMessage, setServerMessage] = useState('');
  const [requestError, setRequestError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [volume, setVolume] = useState(0);

  const transcriptRef = useRef('');

  const [isModelLoaded, _setIsModelLoaded] = useState(false);
  const isModelLoadedRef = useRef(false);
  const setIsModelLoaded = (val) => {
    _setIsModelLoaded(val);
    isModelLoadedRef.current = val;
  };

  const [preferredVoice, _setPreferredVoice] = useState(null);
  const preferredVoiceRef = useRef(null);
  const setPreferredVoice = (v) => {
    _setPreferredVoice(v);
    preferredVoiceRef.current = v;
  };

  const [activeBackendUrl, _setActiveBackendUrl] = useState(configuredBackendUrl);
  const activeBackendUrlRef = useRef(configuredBackendUrl);
  const setActiveBackendUrl = (url) => {
    _setActiveBackendUrl(url);
    activeBackendUrlRef.current = url;
  };

  const [availableVoices, setAvailableVoices] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);

  // Track whether we're in "wake word" mode or "command" mode
  const modeRef = useRef('wake'); // 'wake' | 'command' | 'transition'
  const [recording, setRecording] = useState(null);
  const recordingRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const restartTimerRef = useRef(null);
  const listeningTimeoutRef = useRef(null);
  const isStartingRef = useRef(false);
  const lastPartialRef = useRef('');
  const partialWatchdogRef = useRef(null);
  const xhrRef = useRef(null);
  const speakTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);
  const silentSoundRef = useRef(null);

  const startDucking = async () => {
    if (silentSoundRef.current) {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          staysActiveInBackground: true,
          interruptionModeIOS: 2, // DuckOthers
          interruptionModeAndroid: 2, // DuckOthers
        });
        await silentSoundRef.current.playAsync();
      } catch (err) { /* silent fail */ }
    }
  };

  const stopDucking = async () => {
    console.log('[Audio] Stopping ducking focus...');
    if (silentSoundRef.current) {
      try {
        await silentSoundRef.current.stopAsync();
        await silentSoundRef.current.setVolumeAsync(0);
      } catch (err) { /* silent fail */ }
    }
    try {
      // Release system ducking focus by disabling the flag
      // We also switch interruptionModeAndroid to 1 (DoNotMix) temporarily to force a re-evaluation of focus
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false,
        staysActiveInBackground: true,
        interruptionModeIOS: 1, // MixWithOthers
        interruptionModeAndroid: 1, // DoNotMix (forces pause/restore logic)
      });

      // Delay slightly and set back to standard mode (but with ducking OFF)
      await new Promise(resolve => setTimeout(resolve, 200));

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false,
        staysActiveInBackground: true,
        interruptionModeIOS: 2,
        interruptionModeAndroid: 2,
      });
      console.log('[Audio] Ducking released and volume restoration triggered.');
    } catch (err) { /* silent fail */ }
  };

  const cleanupAudio = async (options = { stopVosk: true }) => {
    console.log('[Cleanup] Starting cleanup flow...');
    try {
      if (options.stopVosk) {
        // Don't wait forever for Vosk to stop
        await Promise.race([
          Vosk.stop(),
          new Promise(resolve => setTimeout(resolve, 300))
        ]).catch(() => { });
      }

      if (recordingRef.current) {
        console.log('[Cleanup] Found stuck recording. Unloading...');
        const rec = recordingRef.current;
        recordingRef.current = null;
        setRecording(null);
        try {
          // Check status with a race to avoid indefinitely hanging the UI
          const status = await Promise.race([
            rec.getStatusAsync(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Status timeout')), 300))
          ]).catch(e => ({ isRecording: true, isPrepared: true })); // Assume the worst

          if (status.isRecording || status.isPrepared) {
            console.log('[Cleanup] Stop/Unload call...');
            await Promise.race([
              rec.stopAndUnloadAsync(),
              new Promise(resolve => setTimeout(resolve, 800)) // 800ms limit for native unload
            ]);
            console.log('[Cleanup] Stuck recording handle released.');
          }
        } catch (e) {
          console.log('[Cleanup] Error stopping stuck recording:', e.message);
        }
      }
    } catch (err) {
      console.warn('[Cleanup] Error during mic reset:', err);
    }
    console.log('[Cleanup] DONE.');
  };

  const [selectedLanguage, setSelectedLanguage] = useState(LANGUAGES[0]);
  const [isLangModalVisible, setIsLangModalVisible] = useState(false);

  // Ignore known library warnings related to NativeEventEmitter on RN 0.73+
  LogBox.ignoreLogs([
    '`new NativeEventEmitter()` was called with a non-null argument without the required `addListener` method',
    '`new NativeEventEmitter()` was called with a non-null argument without the required `removeListeners` method',
  ]);

  // --- VOSK MODEL INITIALIZATION ---
  useEffect(() => {
    const init = async () => {
      if (Platform.OS === 'android') {
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            {
              title: "Microphone Permission",
              message: "Bessie needs access to your microphone to listen for commands.",
            }
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            setStatus('Microphone permission denied');
            return;
          }
        } catch (err) {
          console.warn(err);
        }
      }

      if (Platform.OS === 'ios') {
        try {
          const { status } = await Audio.requestPermissionsAsync();
          if (status !== 'granted') {
            setStatus('Microphone permission denied');
            return;
          }
        } catch (err) {
          console.warn('[Audio] iOS Permission Error:', err);
        }
      }

      setStatus('Loading speech model...');
      Vosk.loadModel('model-en-us')
        .then(() => {
          setIsModelLoaded(true);
          setStatus('Ready');
          console.log('[Vosk] Model loaded successfully');
          startWakeWordListening();
        })
        .catch(err => {
          console.error('[Vosk] Failed to load model:', err);
          setStatus('Failed to load model.');
          setRequestError('Speech model failed to load. Check installation.');
        });
    };

    init();
  }, []);

  // --- SPEECH RECOGNITION EVENTS ---
  useEffect(() => {
    if (!NativeModules.Vosk) return;

    // Use NativeEventEmitter directly to bypass broken library wrappers
    const voskEmitter = new NativeEventEmitter(NativeModules.Vosk);

    const resultSub = voskEmitter.addListener('onResult', (res) => {
      console.log('[Vosk] onResult:', res);
      let text = '';
      try {
        const data = typeof res === 'string' ? JSON.parse(res) : res;
        text = (data.text || '').trim();
      } catch (e) {
        text = String(res).trim();
      }

      if (text) {
        setTranscript(text);
        transcriptRef.current = text;

        const lowerText = text.toLowerCase().trim().replace(/[.,!?]+$/, '');
        const isLocalExit = EXIT_PHRASES.includes(lowerText);

        if (modeRef.current === 'command') {
          if (isLocalExit) {
            console.log('[Vosk] Local exit keyword detected while recording:', lowerText);
            handleStopChat();
          }
          // Do NOT call handleCommandComplete(text) here.
          // We want to let the Whisper recording finish for the actual command.
          return;
        }

        if (modeRef.current === 'wake') {
          const lowerText = text.toLowerCase().trim();
          // De-sensitize: Use word boundaries for stricter matching
          const foundPhrase = WAKE_PHRASES.find(phrase => {
            const regex = new RegExp(`\\b${phrase}\\b`, 'i');
            return regex.test(lowerText);
          });
          
          if (foundPhrase && !isStartingRef.current) {
            console.log('[Vosk] Wake phrase detected (Stricter Match):', foundPhrase);
            triggerCommandPrompt();
          }
        }
      }
    });

    const partialSub = voskEmitter.addListener('onPartialResult', (res) => {
      let text = '';
      try {
        const data = typeof res === 'string' ? JSON.parse(res) : res;
        text = (data.partial || '').trim();
      } catch (e) {
        text = String(res).trim();
      }

      if (text) {
        setTranscript(text);

        if (modeRef.current === 'wake') {
          // REMOVED: Auto-trigger on partial results is too eager/sensitive.
          // We will only trigger on high-confidence final results to prevent false wakeups.
        }
      }
    });

    const finalSub = voskEmitter.addListener('onFinalResult', (res) => {
      console.log('[Vosk] onFinalResult:', res);
      let text = '';
      try {
        const data = typeof res === 'string' ? JSON.parse(res) : res;
        text = (data.text || '').trim();
      } catch (e) {
        text = String(res).trim();
      }

      const finalVal = text || transcriptRef.current;
      if (finalVal) {
        setTranscript(finalVal);
        transcriptRef.current = finalVal;
      }

      setRecognizing(false);
      clearTimeout(listeningTimeoutRef.current);
      clearTimeout(partialWatchdogRef.current);

      if (modeRef.current === 'transition') return;

      if (modeRef.current === 'command') {
        const lowerText = (text || transcriptRef.current || '').toLowerCase().trim().replace(/[.,!?]+$/, '');
        if (EXIT_PHRASES.includes(lowerText)) {
          console.log('[Vosk] Local exit detected (final):', lowerText);
          handleStopChat();
        }
        return;
      }

      if (modeRef.current === 'wake') {
        const lowerText = transcriptRef.current.toLowerCase().trim().replace(/[.,!?]+$/, '');

        // Immediate local exit check on final result too
        if (EXIT_PHRASES.includes(lowerText)) {
          console.log('[Vosk] Local exit detected (final):', lowerText);
          handleStopChat();
          return;
        }

        const foundPhrase = WAKE_PHRASES.find(phrase => lowerText.includes(phrase));
        if (foundPhrase) {
          console.log('[Vosk] Wake phrase detected (final result check):', foundPhrase);
          triggerCommandPrompt();
        } else {
          scheduleRestart('wake');
        }
      }
    });

    const errorSub = voskEmitter.addListener('onError', (err) => {
      console.error('[Vosk] Native Error:', err);
      setRecognizing(false);
      clearTimeout(listeningTimeoutRef.current);
      const message = err ? String(err) : 'Voice recognition error';
      setRequestError(message);
      if (modeRef.current === 'wake') {
        scheduleRestart('error');
      }
    });

    return () => {
      resultSub.remove();
      partialSub.remove();
      finalSub.remove();
      errorSub.remove();
    };
  }, [isModelLoaded]);

  // --- LIFECYCLE / BACKEND SELECTION ---

  useEffect(() => {
    let cancelled = false;

    async function pickReachableBackend() {
      const candidates = getBackendCandidates();

      for (const candidate of candidates) {
        console.log(`[Diagnostic] Checking reachability: ${candidate}/health`);
        try {
          const response = await fetch(`${candidate}/health`, { method: 'GET' });
          if (response.ok) {
            if (!cancelled) {
              setActiveBackendUrl(candidate);
              console.log(`[Diagnostic] Selected backend: ${candidate}`);
            }
            return;
          }
        } catch (e) {
          console.log(`[Diagnostic] ${candidate} is NOT reachable: ${e.message}`);
          // Try the next candidate
        }
      }

      if (!cancelled) {
        console.log(`[Diagnostic] No candidates reachable, defaulting to: ${configuredBackendUrl}`);
        setActiveBackendUrl(configuredBackendUrl);
      }
    }

    void pickReachableBackend();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Initial start
    const setupAndStart = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          staysActiveInBackground: true,
          interruptionModeIOS: 2, // InterruptionModeIOS.DuckOthers
          interruptionModeAndroid: 2, // InterruptionModeAndroid.DuckOthers
          playThroughEarpieceAndroid: false,
        });
        console.log('[Audio] Global audio mode initialized with ducking.');
      } catch (err) {
        console.warn('[Audio] Failed to set initial audio mode:', err);
      }
    };

    setupAndStart();

    // Mapping for accents
    const getAccentLabel = (lang) => {
      const mapping = {
        'en-US': '🇺🇸 US',
        'en-GB': '🇬🇧 UK',
        'en-AU': '🇦🇺 AU',
        'en-IN': '🇮🇳 IN',
        'en-IE': '🇮🇪 IE',
        'en-ZA': '🇿🇦 ZA',
        'en-CA': '🇨🇦 CA',
        'en-NZ': '🇳🇿 NZ',
        'en-SG': '🇸🇬 SG',
      };
      const code = lang.substring(0, 5);
      return mapping[code] || code;
    };

    // Load available voices
    const loadVoices = async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        const englishVoices = voices
          .filter(v => {
            const isEnglish = v.language.toLowerCase().startsWith('en');
            if (!isEnglish) return false;

            if (Platform.OS === 'ios') {
              const isEnhanced = v.quality === 'Enhanced' || v.quality === Speech.VoiceQuality?.Enhanced;
              const isCompact = v.identifier.toLowerCase().includes('compact');
              return isEnhanced && !isCompact;
            }

            return v.localService !== false || v.identifier.toLowerCase().includes('enhanced');
          })
          .map(v => ({
            ...v,
            accentLabel: getAccentLabel(v.language)
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        setAvailableVoices(englishVoices);

        if (englishVoices.length > 0) {
          const alreadySelected = englishVoices.find(v => v.identifier === preferredVoice);
          if (!alreadySelected) {
            const topVoice = englishVoices.find(v => v.identifier.toLowerCase().includes('premium'))
              || englishVoices.find(v => v.identifier.toLowerCase().includes('enhanced'))
              || englishVoices.find(v => v.identifier.toLowerCase().includes('siri'))
              || englishVoices[0];

            if (topVoice) {
              setPreferredVoice(topVoice.identifier);
            }
          }
        }
      } catch (err) {
        console.log('Error loading voices:', err);
      }
    };
    loadVoices();

    // Initialize silent sound for ducking
    const setupSilentSound = async () => {
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==' },
          { isLooping: true, volume: 0.1 }
        );
        silentSoundRef.current = sound;
        console.log('[Audio] Silent sound initialized for ducking focus.');
      } catch (err) {
        console.warn('[Audio] Silent sound init failed:', err);
      }
    };
    setupSilentSound();

    return () => {
      clearTimeout(restartTimerRef.current);
      Vosk.stop();
      if (silentSoundRef.current) {
        silentSoundRef.current.unloadAsync();
      }
    };
  }, []);


  // --- ACTIONS ---
  async function startWakeWordListening() {
    if (isStartingRef.current || !isModelLoadedRef.current) return;
    isStartingRef.current = true;

    try {
      await cleanupAudio({ stopVosk: true });
      await stopDucking();

      // Echo Cancellation Protection: Do not start listening if we are still speaking!
      const isSpeaking = await Speech.isSpeakingAsync();
      if (isSpeaking) {
        console.log('[Bessie] Still speaking. Delaying wake word listening...');
        scheduleRestart('speaking');
        return;
      }

      // Hardware "Breathe" Delay
      await new Promise(resolve => setTimeout(resolve, 500));

      modeRef.current = 'wake';
      setStatus('Say "Hey Dairy" to start...');
      setTranscript('');
      transcriptRef.current = '';

      setRecognizing(true);
      // Run Vosk with BOTH wake phrases and exit keywords locally
      await Vosk.start({ grammar: [...WAKE_PHRASES, ...EXIT_PHRASES] });
    } catch (err) {
      console.warn('[Vosk] Failed to start wake word listening:', err);
      setRecognizing(false);
      scheduleRestart('error');
    } finally {
      isStartingRef.current = false;
    }
  }

  async function triggerCommandPrompt() {
    isStartingRef.current = false;
    modeRef.current = 'transition';
    setStatus('Readying...');
    setTranscript('');
    transcriptRef.current = '';

    await Vosk.stop();

    // Small delay to ensure Vosk STOP is respected by the hardware before speaking
    await new Promise(r => setTimeout(r, 100));

    Speech.speak('Moooooo', {
      rate: 1.1,
      voice: preferredVoiceRef.current,
      onDone: () => setTimeout(() => startCommandListening(), 300),
      onError: () => setTimeout(() => startCommandListening(), 300)
    });
  }

  async function startRecording() {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setRequestError('Microphone permission not granted');
        return;
      }

      await cleanupAudio({ stopVosk: false });

      // Echo Cancellation Protection
      const isSpeaking = await Speech.isSpeakingAsync();
      if (isSpeaking) {
        setTimeout(() => startRecording(), 500);
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        staysActiveInBackground: true,
        interruptionModeIOS: 2, // DuckOthers
        interruptionModeAndroid: 2, // DuckOthers
      });

      console.log('[Audio] Starting Whisper recording...');
      const newRecording = new Audio.Recording();

      const options = {
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 64000,
          isMeteringEnabled: true,
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
          isMeteringEnabled: true,
        },
      };

      await newRecording.prepareToRecordAsync(options);

      newRecording.setOnRecordingStatusUpdate((s) => {
        if (s.isRecording && s.metering !== undefined) {
          // Normalize metering (-80 to 0) to 0.0 - 1.0
          // console.log('[Audio] Metering:', s.metering);
          const norm = Math.max(0, (s.metering + 80) / 80);
          setVolume(norm);

          // Only allow silence-detection AFTER 1.5 seconds of recording
          if (s.durationMillis > 1500) {
            if (s.metering > -30) { // Require slightly louder input to reset the timer (ignore background talk)
              clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
            } else if (s.metering < -42) { // Treat everything quieter than -42dB as silence
              if (!silenceTimerRef.current) {
                silenceTimerRef.current = setTimeout(() => {
                  console.log('[Audio] Silence Timed Out (Fast Stop).');
                  stopAndSendRecording();
                }, 1000); // Shorter silence window for better responsiveness
              }
            }
          }
        }
      });

      setRecording(newRecording);
      recordingRef.current = newRecording;
      console.log('[Audio] Preparing to startAsync...');
      await newRecording.startAsync();
      console.log('[Audio] Recording started.');

      setTimeout(() => stopAndSendRecording(), 7500); // Safety timeout

    } catch (err) {
      console.warn('[Audio] Failed to record:', err);
      startWakeWordListening();
    }
  }

  async function stopAndSendRecording() {
    clearTimeout(silenceTimerRef.current);
    try {
      const rec = recordingRef.current;
      if (!rec) return;

      console.log('[Audio] Stopping for Whisper...');
      await cleanupAudio({ stopVosk: true });

      const uri = rec.getURI();
      if (uri) {
        setVolume(0);
        sendRecordingToBackend(uri);
      } else {
        setVolume(0);
        startWakeWordListening();
      }
    } catch (err) {
      console.warn('[Audio] Failed to stop:', err);
      startWakeWordListening();
    }
  }

  async function startCommandListening(isFollowUp = false) {
    if (isStartingRef.current || !isModelLoadedRef.current) return;

    clearTimeout(listeningTimeoutRef.current);
    modeRef.current = 'command';
    setStatus(isFollowUp ? 'Listening (Whisper)...' : 'Listening... (Whisper)');
    setTranscript('(Recording audio...)');

    await cleanupAudio({ stopVosk: false });
    
    // Ensure Vosk is listening ONLY for exit phrases during command recording to save performance
    await Vosk.start({ grammar: EXIT_PHRASES });

    startRecording();
  }

  function scheduleRestart(reason) {
    clearTimeout(restartTimerRef.current);
    restartTimerRef.current = setTimeout(async () => {
      const isSpeaking = await Speech.isSpeakingAsync();
      if (isSpeaking) {
        scheduleRestart(reason);
        return;
      }
      startWakeWordListening();
    }, 1000);
  }


  async function sendTranscriptToBackend(finalTranscript) {
    setLoading(true);
    setServerMessage('Thinking...');
    setStatus('Thinking...');
    setRequestError('');

    // Check for explicit exit phrases (isolated matches ONLY)
    const lowerTranscript = (finalTranscript || '').toLowerCase().trim().replace(/[.,!?]+$/, '');
    if (EXIT_PHRASES.includes(lowerTranscript)) {
      console.log('[Bessie] Exit phrase detected:', lowerTranscript);
      setLoading(false);
      setStatus('Ready');
      await stopDucking();
      const response = lowerTranscript.includes('thank') ? 'You are very welcome! Goodbye.' : 'Okay, stopping.';
      Speech.speak(response, {
        onDone: () => startWakeWordListening(),
        onError: () => startWakeWordListening()
      });
      return;
    }

    // Start ducking while thinking
    void startDucking();

    if (abortControllerRef.current) abortControllerRef.current.abort();

    abortControllerRef.current = new AbortController();

    try {
      console.log(`[Backend] POST ${activeBackendUrlRef.current}/api/voice-chat with transcript: "${finalTranscript}"`);
      const response = await fetch(`${activeBackendUrlRef.current}/api/voice-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          transcript: finalTranscript,
          language: selectedLanguage.code
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${data?.error ?? data?.summary ?? 'Request failed'}`);
      }

      // Handle both 'summary' (from snippet) and 'response' (from current backend)
      const receivedSummary = data.summary ?? data.response ?? 'No answer obtained.';
      setServerMessage(receivedSummary);
      setStatus('Playing response...');

      // Stop everything before Bessie speaks to prevent echo
      await cleanupAudio();

      // Ensure focus is kept during speech
      await startDucking();

      const bestVoiceMatch = availableVoices.find(v => v.language.startsWith(selectedLanguage.voicePrefix));
      const voiceId = bestVoiceMatch ? bestVoiceMatch.identifier : preferredVoiceRef.current;

      Speech.speak(receivedSummary, {
        rate: 1.0,
        voice: voiceId,
        onDone: () => {
          void stopDucking();
          speakTimeoutRef.current = setTimeout(() => startCommandListening(true), 500);
        },
        onError: () => {
          void stopDucking();
          speakTimeoutRef.current = setTimeout(() => startWakeWordListening(), 500);
        },
      });



    } catch (error) {
      void stopDucking();
      if (error.name === 'AbortError') {

        console.log('[Backend] Fetch aborted');
        return;
      }
      console.error('[Backend-Error] voice-chat failed:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      setRequestError(message);
      setStatus('Error');
      Alert.alert('Voice API failed', message);
      startWakeWordListening();
    } finally {
      setLoading(false);
    }
  }

  async function sendRecordingToBackend(uri) {
    setLoading(true);
    setServerMessage('Transcribing with Whisper...');
    setStatus('Thinking...');
    setRequestError('');

    // Duck while transcribing/thinking
    void startDucking();

    console.log(`[Audio] Prep Sending Recording, URI: ${uri}`);


    // Quick connectivity pre-check
    try {
      const ping = await fetch(`${activeBackendUrlRef.current}/health`);
      console.log(`[Diagnostic] Pre-check /health ping: ${ping.status}`);
    } catch (e) {
      console.log(`[Diagnostic] Pre-check /health FAILED: ${e.message}`);
    }

    try {
      const formData = new FormData();
      formData.append('audio', {
        uri: uri,
        type: 'audio/m4a',
        name: 'command.m4a',
      });
      formData.append('language', selectedLanguage.code);

      console.log(`[Backend] Sending request to: ${activeBackendUrlRef.current}/api/whisper-chat...`);

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${activeBackendUrlRef.current}/api/whisper-chat`);

        // Important: Content-Type is set automatically by the phone for FormData

        xhr.onload = async () => {
          xhrRef.current = null;
          console.log(`[Backend] Received XHR status: ${xhr.status}`);
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) {
              console.log(`[Backend] Response data parsed.`);
              const transcript = data.transcript || '';
              if (transcript) setTranscript(transcript);

              // Check for exit phrases in the processed Whisper transcript too (strict match)
              const lowerTranscript = transcript.toLowerCase().trim().replace(/[.,!?]+$/, '');
                if (EXIT_PHRASES.includes(lowerTranscript)) {
                  console.log('[Bessie] Exit phrase detected in Whisper:', lowerTranscript);
                  setLoading(false);
                  setStatus('Ready');
                  await stopDucking();
                  const response = lowerTranscript.includes('thank') ? 'No problem at all! talk soon.' : 'Understood. Stopping now.';
                  Speech.speak(response, {
                    onDone: () => startWakeWordListening(),
                    onError: () => startWakeWordListening(),
                  });
                  resolve(data);
                  return;
                }

                if (data.summary) {
                  setServerMessage(data.summary);
                  setStatus('Playing response...');
                  const bestVoiceMatch = availableVoices.find(v => v.language.startsWith(selectedLanguage.voicePrefix));
                  const voiceId = bestVoiceMatch ? bestVoiceMatch.identifier : preferredVoiceRef.current;

                  // Maintain audio focus during speech
                  await startDucking();

                  Speech.speak(data.summary, {
                    rate: 1.0,
                    voice: voiceId,
                    onDone: () => {
                      void stopDucking();
                      // Check if AI signalled an exit (via termination tool)
                      if (data.exit) {
                        console.log('[Bessie] AI requested termination. Returning to wake mode.');
                        startWakeWordListening();
                      } else {
                        speakTimeoutRef.current = setTimeout(() => startCommandListening(true), 500);
                      }
                    },
                    onError: () => {
                      void stopDucking();
                      speakTimeoutRef.current = setTimeout(() => startWakeWordListening(), 500);
                    },
                  });
                }
              resolve(data);
            } else {
              reject(new Error(data?.error ?? `Request failed with status ${xhr.status}`));
            }
          } catch (e) {
            reject(new Error(`Failed to parse response: ${xhr.responseText.substring(0, 50)}`));
          }
        };

        xhr.onerror = (e) => {
          console.log('[Backend] XHR Error:', e);
          reject(new Error('Network request failed'));
        };

        xhr.ontimeout = () => {
          console.log('[Backend] XHR Timeout');
          reject(new Error('Request timed out'));
        };

        xhr.onabort = () => {
          console.log('[Backend] XHR Aborted');
          reject(new Error('Request aborted'));
        };

        xhr.timeout = 45000;
        xhrRef.current = xhr;
        xhr.send(formData);
      });

    } catch (error) {
      void stopDucking();
      console.error('[Backend-Error] sendRecordingToBackend failed:', error);

      const message = error instanceof Error ? error.message : 'Unknown error';
      setRequestError(message);
      setStatus('Error');
      Alert.alert('Whisper API failed', message);
      startWakeWordListening();
    } finally {
      setLoading(false);
    }
  }

  const handleManualTrigger = () => {
    triggerCommandPrompt();
  };

  const selectVoice = (voiceId) => {
    setPreferredVoice(voiceId);
    setIsModalVisible(false);
    Speech.speak("Voice selected.", { voice: voiceId });
  };

  const handleStopChat = async () => {
    console.log('[Bessie] Manual Stop Chat triggered');

    // Clear all possible timers
    clearTimeout(restartTimerRef.current);
    clearTimeout(silenceTimerRef.current);
    clearTimeout(listeningTimeoutRef.current);
    clearTimeout(partialWatchdogRef.current);
    clearTimeout(speakTimeoutRef.current);

    // Abort pending requests
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Stop speaking immediately
    Speech.stop();

    // Cleanup audio hardware and release mic
    await cleanupAudio({ stopVosk: true });

    // Reset state machines
    modeRef.current = 'wake';
    isStartingRef.current = false;

    // UI state reset
    setLoading(false);
    setRecognizing(false);
    setVolume(0);
    setStatus('Stopped');
    setTranscript('');
    setServerMessage('');

    // Force ducking OFF and restore music volume
    // We add a tiny delay to ensure Speech.stop() and cleanupAudio() have fully relinquished focus
    setTimeout(() => {
      void stopDucking();
    }, 400);

    // Restart wake word listening after a small pause
    setTimeout(() => {
      startWakeWordListening();
    }, 1200);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>🐄 Bessie</Text>
      <Text style={styles.subtitle}>Farm Voice Assistant</Text>

      <View style={styles.statusBox}>
        <Text style={styles.statusLabel}>STATUS</Text>
        <Text style={styles.statusText}>{status}</Text>
        {modeRef.current !== 'transition' && transcript.length > 0 && (
          <View style={styles.transcriptContainer}>
            <ScrollView style={styles.transcriptScroll} contentContainerStyle={styles.transcriptScrollContent}>
              <Text style={styles.partialTranscript}>“{transcript}”</Text>
            </ScrollView>
          </View>
        )}
        {modeRef.current === 'transition' && transcript.length > 0 && !loading && (
          <View style={styles.transcriptContainer}>
            <Text style={[styles.partialTranscript, { color: '#9ca3af' }]}>Heard: “{transcript}”</Text>
          </View>
        )}
        {(recognizing || loading || !!recording) && (
          <View style={styles.centerRow}>
            <ActivityIndicator size="small" color="#4ade80" style={styles.indicator} />
            <Visualizer volume={volume} isActive={!!recording} />
          </View>
        )}
        {recognizing && modeRef.current === 'wake' && (
          <View style={styles.wakeIndicator} />
        )}
      </View>

      {serverMessage.length > 0 && (
        <View style={styles.responseBox}>
          <Text style={styles.responseLabel}>Bessie Says</Text>
          <View style={styles.responseTextContainer}>
            <ScrollView style={styles.responseScroll} showsVerticalScrollIndicator={true}>
              <Text style={styles.responseText}>{serverMessage}</Text>
            </ScrollView>
          </View>
        </View>
      )}

      {requestError.length > 0 && (
        <Text style={{ color: '#ef4444', marginBottom: 10 }}>{requestError}</Text>
      )}

      <TouchableOpacity style={styles.button} onPress={handleManualTrigger}>
        <Text style={styles.buttonText}>🎙️ Manual Trigger</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.stopButton} onPress={handleStopChat}>
        <Text style={styles.stopButtonText}>🛑 Stop Bessie</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.voiceButton, { marginBottom: 10 }]}
        onPress={() => setIsLangModalVisible(true)}
      >
        <Text style={styles.voiceButtonText}>🌐 Language: {selectedLanguage.label}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.voiceButton}
        onPress={() => setIsModalVisible(true)}
      >
        <Text style={styles.voiceButtonText}>🗣️ Speaker Voice</Text>
      </TouchableOpacity>

      <Text style={styles.hint}>Say "Hey Dairy" to start hands-free</Text>

      <Modal
        animationType="slide"
        transparent={true}
        visible={isLangModalVisible}
        onRequestClose={() => setIsLangModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalHeader}>Select Language</Text>
            <FlatList
              data={LANGUAGES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.voiceItem,
                    item.code === selectedLanguage.code && styles.voiceItemActive
                  ]}
                  onPress={() => {
                    setSelectedLanguage(item);
                    setIsLangModalVisible(false);
                    setServerMessage('');
                  }}
                >
                  <Text style={styles.voiceItemText}>{item.label}</Text>
                </Pressable>
              )}
            />
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setIsLangModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalHeader}>Select a Voice</Text>
            <FlatList
              data={availableVoices}
              keyExtractor={(item) => item.identifier}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.voiceItem,
                    item.identifier === preferredVoice && styles.voiceItemActive
                  ]}
                  onPress={() => selectVoice(item.identifier)}
                >
                  <View style={styles.voiceItemInfo}>
                    <Text style={[
                      styles.voiceItemText,
                      item.identifier === preferredVoice && styles.voiceItemTextActive
                    ]}>
                      {item.name}
                    </Text>
                    <Text style={styles.accentText}>
                      {item.accentLabel}
                    </Text>
                  </View>
                </Pressable>
              )}
            />
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setIsModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>

            <View style={styles.helpBox}>
              <Text style={styles.helpTitle}>💡 How to add more voices</Text>
              <Text style={styles.helpText}>
                {Platform.OS === 'ios'
                  ? "Go to Settings > Accessibility > Spoken Content > Voices to download new high-quality voices."
                  : "Go to Settings > Accessibility > Text-to-speech output to install new voice data."}
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// --- SUB-COMPONENTS ---
const Visualizer = ({ volume, isActive }) => {
  const bars = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  const animValues = useRef(bars.map(() => new Animated.Value(4))).current;

  useEffect(() => {
    if (isActive) {
      animValues.forEach((val, i) => {
        const distFromCenter = Math.abs(i - (bars.length - 1) / 2);
        const factor = 1 - (distFromCenter / (bars.length / 2)) * 0.7;

        // Use timing for snappier visualizer updates than spring
        Animated.timing(val, {
          toValue: Math.max(4, volume * 45 * factor + (Math.random() * 8)),
          duration: 90,
          useNativeDriver: false,
        }).start();
      });
    } else {
      animValues.forEach((val) => {
        Animated.timing(val, {
          toValue: 4,
          duration: 250,
          useNativeDriver: false,
        }).start();
      });
    }
  }, [volume, isActive]);

  return (
    <View style={styles.visualizerContainer}>
      {animValues.map((val, i) => (
        <Animated.View key={i} style={[styles.visualizerBar, { height: val }]} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  signOutButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#374151',
    marginBottom: 20,
  },
  signOutText: {
    color: '#9ca3af',
    fontSize: 12,
  },
  authPlaceholder: {
    marginBottom: 20,
    alignItems: 'center',
  },
  container: {
    flex: 1,
    padding: 32,
    backgroundColor: '#0f1117',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 40,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  statusBox: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#374151',
  },
  statusLabel: {
    fontSize: 11,
    color: '#6b7280',
    letterSpacing: 2,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  statusText: {
    fontSize: 16,
    color: '#e5e7eb',
    textAlign: 'center',
  },
  centerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  visualizerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: 30,
    marginLeft: 10,
  },
  visualizerBar: {
    width: 3,
    backgroundColor: '#4ade80',
    borderRadius: 2,
  },
  transcriptContainer: {
    maxHeight: 100,
    width: '100%',
    marginTop: 8,
  },
  transcriptScroll: {
    width: '100%',
  },
  transcriptScrollContent: {
    alignItems: 'center',
  },
  partialTranscript: {
    fontSize: 14,
    color: '#4ade80',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  responseTextContainer: {
    maxHeight: 200,
  },
  responseScroll: {
    width: '100%',
  },
  indicator: {
    marginRight: 10,
  },
  wakeIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
    marginTop: 12,
    opacity: 0.5,
  },
  responseBox: {
    backgroundColor: '#064e3b',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#065f46',
  },
  responseLabel: {
    fontSize: 11,
    color: '#6ee7b7',
    letterSpacing: 2,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  responseText: {
    fontSize: 15,
    color: '#d1fae5',
    lineHeight: 22,
  },
  button: {
    backgroundColor: '#16a34a',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 50,
    marginBottom: 12,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  stopButton: {
    backgroundColor: '#991b1b',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 50,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#7f1d1d',
    width: '80%',
    alignItems: 'center',
  },
  stopButtonText: {
    color: '#fecaca',
    fontSize: 15,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  voiceButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4b5563',
    marginBottom: 20,
  },
  voiceButtonText: {
    color: '#9ca3af',
    fontSize: 14,
  },
  hint: {
    fontSize: 12,
    color: '#4b5563',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1f2937',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 20,
    textAlign: 'center',
  },
  voiceItem: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#374151',
  },
  voiceItemActive: {
    backgroundColor: '#059669',
  },
  voiceItemText: {
    color: '#e5e7eb',
    fontSize: 15,
  },
  voiceItemTextActive: {
    fontWeight: 'bold',
    color: '#ffffff',
  },
  closeButton: {
    marginTop: 16,
    backgroundColor: '#4b5563',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  voiceItemInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accentText: {
    fontSize: 12,
    color: '#9ca3af',
    backgroundColor: '#1f2937',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
  helpBox: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  helpTitle: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  helpText: {
    color: '#9ca3af',
    fontSize: 12,
    lineHeight: 18,
  }
});
registerRootComponent(App);
