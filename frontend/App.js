import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, PermissionsAndroid, Platform, LogBox, Modal, FlatList, Pressable } from 'react-native';
import Voice from '@react-native-voice/voice';
import * as Speech from 'expo-speech';

// Wake phrase — user says this to start a command (case-insensitive)
const WAKE_PHRASES = ['hey bessie', 'ok bessie', 'hey bess'];
const BACKEND_URL = 'http://144.39.223.235:3000/api/chat';

export default function App() {
  const [status, setStatus] = useState('Initializing...');
  const [response, setResponse] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [preferredVoice, setPreferredVoice] = useState(null);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  
  // Ignore known library warnings related to NativeEventEmitter on RN 0.73+
  LogBox.ignoreLogs([
    '`new NativeEventEmitter()` was called with a non-null argument without the required `addListener` method',
    '`new NativeEventEmitter()` was called with a non-null argument without the required `removeListeners` method',
  ]);

  // Track whether we're in "wake word" mode or "command" mode
  const modeRef = useRef('wake'); // 'wake' | 'command'
  const isStartingRef = useRef(false); // New: prevents double-starts
  const restartTimerRef = useRef(null);
  const lastPromptTimeRef = useRef(0);
  const commandDebounceRef = useRef(null);
  useEffect(() => {
    Voice.onSpeechStart = (e) => {
      console.log('[Diagnostic] Local: Speech Started', e);
      if (modeRef.current === 'command') {
        setStatus('👂 Listening...');
      }
    };

    Voice.onSpeechEnd = (e) => {
      console.log('[Diagnostic] Local: Speech Ended', e);
    };

    Voice.onSpeechVolumeChanged = (e) => {
      // Volume log is very spammy, only log once every 100 calls or if significant
    };
    
    Voice.onSpeechPartialResults = (e) => {
      // Only show partials when expecting a command or processing.
      if (modeRef.current === 'command' && e.value && e.value[0]) {
        setPartialTranscript(e.value[0]);
      }
    };

    Voice.onSpeechResults = (e) => handleSpeechResults(e);

    Voice.onSpeechError = async (e) => {
      const code = e?.error?.code || e?.code;
      // Filter out common "no match" and "timeout" errors from console logs
      const isExpectedError = ['7', 7, '6', 6].includes(code);
      if (!isExpectedError) {
        console.log('Speech error:', code, e?.error?.message || e?.message);
      }
      scheduleRestart(code);
    };

    // Request mic permission up front, then start listening
    requestMicPermission().then((granted) => {
      if (granted) {
        startWakeWordListening();
      } else {
        setStatus('Microphone permission denied. Please enable in Settings.');
      }
    });

    // Load available voices
    const loadVoices = async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        const englishVoices = voices
          .filter(v => {
            const isEnglish = v.language.startsWith('en');
            if (!isEnglish) return false;

            if (Platform.OS === 'ios') {
              // iOS: 'compact' voices are low-quality fallbacks. 
              // 'Default', 'Enhanced', and 'Premium' are the good ones.
              return !v.identifier.toLowerCase().includes('compact');
            }
            
            // Android: localService usually indicates it's on-device.
            // If localService isn't present, we'll keep it as a best-effort.
            return v.localService !== false; 
          })
          .sort((a, b) => a.name.localeCompare(b.name));
        
        setAvailableVoices(englishVoices);

        // Auto-select "best" voice initially
        const topVoice = englishVoices.find(v => v.identifier.toLowerCase().includes('premium'))
          || englishVoices.find(v => v.identifier.toLowerCase().includes('enhanced'))
          || englishVoices.find(v => v.identifier.toLowerCase().includes('siri'))
          || englishVoices[0];

        if (topVoice) {
          console.log(`[Diagnostic] Initial Voice: ${topVoice.identifier}`);
          setPreferredVoice(topVoice.identifier);
        }
      } catch (err) {
        console.log('Error loading voices:', err);
      }
    };
    loadVoices();

    return () => {
      clearTimeout(restartTimerRef.current);
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  const requestMicPermission = async () => {
    if (Platform.OS !== 'android') return true;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission',
          message: 'Bessie needs microphone access to hear your voice commands.',
          buttonPositive: 'Allow',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (e) {
      console.warn('Permission error:', e);
      return false;
    }
  };

  const startWakeWordListening = async (shouldCancel = false) => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    modeRef.current = 'wake';
    setStatus('Ready for "Hey Bessie"');
    setIsListening(true);
    setPartialTranscript('');
    
    try {
      // Ensure engine is available
      const isAvailable = await Voice.isAvailable();
      if (!isAvailable) {
        console.warn('[Diagnostic] Voice engine not available on this device');
      }

      Voice.cancel().catch(() => {});
      await Voice.start('en-US');
    } catch (e) {
      const code = e?.error?.code || e?.code;
      const isExpectedError = ['7', 7, '6', 6].includes(code);
      if (!isExpectedError && !e?.message?.includes('already started')) {
        console.log('Error starting wake listening:', code, e?.message || e?.error?.message);
      }
      scheduleRestart(code);
    } finally {
      isStartingRef.current = false;
    }
  };

  const startCommandListening = async () => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    modeRef.current = 'command';
    setStatus('Go ahead, I\'m listening...');
    setIsListening(true);
    setPartialTranscript(''); // Clear for new command
    
    try {
      // Attempt to clear previous session, but don't hang if it fails
      Voice.cancel().catch(() => {});
      await new Promise(r => setTimeout(r, 150));
      
      console.log('[Diagnostic] Starting mic with mode:', modeRef.current);
      await Voice.start('en-US');
    } catch (e) {
      console.log('[Diagnostic] Start Mic Error:', e?.message || e?.error?.message);
      startWakeWordListening(true);
    } finally {
      isStartingRef.current = false;
    }
  };

  /**
   * Prompts the user (e.g. "Yes?") and then starts listening for a command.
   * This is used by both the Manual Trigger and the Wake Phrase detection.
   */
  const triggerCommandPrompt = async (prompt = 'Yes?') => {
    // Clear guards instantly
    isStartingRef.current = false;
    Voice.cancel().catch(() => {});
    setPartialTranscript('');

    setStatus('Preparing microphone...');
    setIsListening(true);
    
    let called = false;
    const safeStart = () => {
      if (!called) {
        called = true;
        startCommandListening();
      }
    };

    // Safety timeout: if TTS doesn't finish in 2s, start anyway
    const timeoutId = setTimeout(() => {
      console.log('[Diagnostic] Prompt callback timeout');
      safeStart();
    }, 2000);

    Speech.speak(prompt, { 
      rate: 1.1, 
      voice: preferredVoice,
      onDone: () => {
        lastPromptTimeRef.current = Date.now();
        clearTimeout(timeoutId);
        safeStart();
      },
      onError: (err) => {
        lastPromptTimeRef.current = Date.now();
        console.log('[Diagnostic] Prompt TTS Error:', err);
        clearTimeout(timeoutId);
        safeStart();
      }
    });
  };

  const scheduleRestart = (code) => {
    const isRetryable = code === '7' || code === 7 || code === '6' || code === 6;
    
    // Only set listening to false for "long" gaps or real errors.
    // For normal timeouts (7/6), keep the indicator active to prevent flicker.
    if (!isRetryable) {
      setIsListening(false);
    }
    
    clearTimeout(restartTimerRef.current);
    
    // error 5 (CLIENT_ERROR) often needs a slightly longer cooldown
    const delay = (code === '5' || code === 5) ? 1000 : 400;

    restartTimerRef.current = setTimeout(async () => {
      // Don't restart mic if we're currently speaking a response
      const isSpeaking = await Speech.isSpeakingAsync();
      if (isSpeaking) {
        scheduleRestart(code); // Check again in a bit
        return;
      }
      startWakeWordListening(true);
    }, delay);
  };

  const handleSpeechResults = async (e) => {
    // Safety: ignore results if they occurred during or immediately after our own prompt
    const timeSincePrompt = Date.now() - lastPromptTimeRef.current;
    if (timeSincePrompt < 500) {
      console.log('[Diagnostic] Ignoring speech result because it occurred during own prompt');
      return;
    }

    setIsListening(false);
    const results = e.value || [];
    const transcript = results[0]?.toLowerCase() || '';

    if (modeRef.current === 'wake') {
      const wakeDetected = WAKE_PHRASES.some((phrase) => transcript.includes(phrase));

      if (wakeDetected) {
        // Check if the command came in the same utterance (e.g. "Hey Bessie how is Cow 42?")
        const command = extractCommandAfterWakePhrase(transcript, results[0]);
        if (command && command.trim().length > 3) {
          await processCommand(command.trim());
        } else {
          // Wake phrase only — speak prompt then start command listening
          await triggerCommandPrompt('Yes?');
        }
      } else {
        // Not a wake phrase, keep listening
        startWakeWordListening();
      }
    } else if (modeRef.current === 'command') {
      const command = results[0];
      if (command && command.trim().length > 0) {
        // Debounce: wait for a pause (1.5s) before processing the final command
        clearTimeout(commandDebounceRef.current);
        setPartialTranscript(command); // Show latest full segment as partial
        
        commandDebounceRef.current = setTimeout(async () => {
          setIsListening(false);
          Voice.stop().catch(() => {});
          await processCommand(command.trim());
        }, 1500); 
      }
    }
  };

  const extractCommandAfterWakePhrase = (lowerTranscript, originalTranscript) => {
    for (const phrase of WAKE_PHRASES) {
      const idx = lowerTranscript.indexOf(phrase);
      if (idx !== -1) {
        return originalTranscript.slice(idx + phrase.length);
      }
    }
    return null;
  };

  const processCommand = async (text) => {
    const url = BACKEND_URL;
    console.log(`[Diagnostic] Sending text: "${text}" to ${url}`);
    setStatus(`Thinking...`);
    setIsProcessing(true);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true' // Bypass ngrok warning just in case
        },
        body: JSON.stringify({ text }),
      });

      console.log(`[Diagnostic] Response status: ${res.status} ${res.statusText}`);

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`[Diagnostic] Backend returned ${res.status}: ${errorText}`);
        setStatus(`Error: ${res.status}`);
        startWakeWordListening();
        return;
      }

      const data = await res.json();
      console.log(`[Diagnostic] Received data:`, data);

      if (data.response) {
        setResponse(data.response);
        setStatus('Playing response...');
        Speech.speak(data.response, {
          rate: 1.0,
          voice: preferredVoice, // Use the high-quality voice
          onDone: () => startWakeWordListening(),
          onError: () => startWakeWordListening(),
        });
      } else {
        setStatus('Error from backend');
        startWakeWordListening();
      }
    } catch (err) {
      console.error('[Diagnostic] Fetch Exception:', err);
      console.error('[Diagnostic] Error Name:', err.name);
      console.error('[Diagnostic] Error Message:', err.message);
      setStatus('Network Error');
      startWakeWordListening();
    } finally {
      setIsProcessing(false);
    }
  };

  // Manual trigger for testing (simulates wake word detected)
  const handleManualTrigger = async () => {
    await triggerCommandPrompt('Yes?');
  };

  const selectVoice = (voiceId) => {
    setPreferredVoice(voiceId);
    setIsModalVisible(false);
    Speech.speak("Voice selected.", { voice: voiceId });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>🐄 Bessie</Text>
      <Text style={styles.subtitle}>Farm Voice Assistant</Text>

      <View style={styles.statusBox}>
        <Text style={styles.statusLabel}>STATUS</Text>
        <Text style={styles.statusText}>{status}</Text>
        {partialTranscript.length > 0 && (
          <Text style={styles.partialTranscript}>"{partialTranscript}"</Text>
        )}
        {((isListening && modeRef.current === 'command') || isProcessing) && (
          <ActivityIndicator size="small" color="#4ade80" style={styles.indicator} />
        )}
        {isListening && modeRef.current === 'wake' && (
          <View style={styles.wakeIndicator} />
        )}
      </View>

      {response.length > 0 && (
        <View style={styles.responseBox}>
          <Text style={styles.responseLabel}>Last Response</Text>
          <Text style={styles.responseText}>{response}</Text>
        </View>
      )}

      <TouchableOpacity style={styles.button} onPress={handleManualTrigger}>
        <Text style={styles.buttonText}>🎙️ Manual Trigger</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.voiceButton} 
        onPress={() => setIsModalVisible(true)}
      >
        <Text style={styles.voiceButtonText}>🗣️ Change Voice</Text>
      </TouchableOpacity>

      <Text style={styles.hint}>Say "Hey Bessie" to start hands-free</Text>

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
                  <Text style={[
                    styles.voiceItemText,
                    item.identifier === preferredVoice && styles.voiceItemTextActive
                  ]}>
                    {item.name} ({item.quality})
                  </Text>
                </Pressable>
              )}
            />
            <TouchableOpacity 
              style={styles.closeButton} 
              onPress={() => setIsModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
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
  partialTranscript: {
    fontSize: 14,
    color: '#4ade80',
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  indicator: {
    marginTop: 12,
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
  }
});


