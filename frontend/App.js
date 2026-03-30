import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Platform, LogBox, Modal, FlatList, Pressable, ScrollView } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import * as Speech from 'expo-speech';

// --- CONFIGURATION ---
const WAKE_PHRASES = ['hey dairy', 'ok dairy', 'hey dair'];
const configuredBackendUrl = 'http://144.39.223.235:3000';
const getBackendCandidates = () => [
  'http://144.39.223.235:3000',
  'http://localhost:3000',
];

export default function App() {
  const [status, setStatus] = useState('Initializing...');
  const [serverMessage, setServerMessage] = useState('');
  const [requestError, setRequestError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const transcriptRef = useRef('');
  
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
  const restartTimerRef = useRef(null);
  const listeningTimeoutRef = useRef(null);
  const isStartingRef = useRef(false);

  // Ignore known library warnings related to NativeEventEmitter on RN 0.73+
  LogBox.ignoreLogs([
    '`new NativeEventEmitter()` was called with a non-null argument without the required `addListener` method',
    '`new NativeEventEmitter()` was called with a non-null argument without the required `removeListeners` method',
  ]);

  // --- SPEECH RECOGNITION EVENTS ---
  useEffect(() => {
    const startSub = ExpoSpeechRecognitionModule.addListener('start', () => {
      setRecognizing(true);
      setTranscript('');
      transcriptRef.current = '';
      setServerMessage('');
      setRequestError('');
      // Speech.stop(); // Temporarily removed to prevent potential background music interruption
    });

    const resultSub = ExpoSpeechRecognitionModule.addListener('result', (event) => {
      const text = event.results?.[0]?.transcript;
      if (text) {
        setTranscript(text);
        transcriptRef.current = text;
        
        // Handle Wake Word detection in real-time if in 'wake' mode
        if (modeRef.current === 'wake') {
          const lowerText = text.toLowerCase();
          const foundPhrase = WAKE_PHRASES.find(phrase => lowerText.includes(phrase));
          if (foundPhrase && !isStartingRef.current && event.results[0].isFinal) {
             // We found a wake phrase! Trigger a prompt regardless of what followed
             triggerCommandPrompt();
          }
        }
      }
    });

    const endSub = ExpoSpeechRecognitionModule.addListener('end', () => {
      setRecognizing(false);
      clearTimeout(listeningTimeoutRef.current);
      
      // If we are transitioning between wake and command mode, ignore this 'end' event.
      // The wake session just finished, and triggerCommandPrompt is handling the "Yes" prompt.
      if (modeRef.current === 'transition') {
        return;
      }
      
      // Safety check for wake mode in case 'result' didn't trigger 'final' logic
      if (modeRef.current === 'wake') {
        const lowerText = transcriptRef.current.toLowerCase();
        const foundPhrase = WAKE_PHRASES.find(phrase => lowerText.includes(phrase));
        if (foundPhrase) {
            triggerCommandPrompt();
            return;
        }
      }

      if (modeRef.current === 'command') {
        if (transcriptRef.current) {
          sendTranscriptToBackend(transcriptRef.current);
          transcriptRef.current = ''; // Prevent duplicate sends
        } else {
          // No command heard during the command session (e.g. 5s silence), back to wake
          startWakeWordListening();
        }
      } else if (modeRef.current === 'wake') {
        scheduleRestart('wake');
      }
    });

    const errorSub = ExpoSpeechRecognitionModule.addListener('error', (event) => {
      setRecognizing(false);
      clearTimeout(listeningTimeoutRef.current);
      const message = event.error ? String(event.error) : 'Voice recognition error';
      setRequestError(message);
      if (modeRef.current === 'wake') {
        scheduleRestart('error');
      }
    });

    return () => {
      startSub.remove();
      resultSub.remove();
      endSub.remove();
      errorSub.remove();
    };
  }, []);

  // --- LIFECYCLE / BACKEND SELECTION ---

  useEffect(() => {
    let cancelled = false;

    async function pickReachableBackend() {
      const candidates = getBackendCandidates();

      for (const candidate of candidates) {
        try {
          const response = await fetch(`${candidate}/health`, { method: 'GET' });
          if (response.ok) {
            if (!cancelled) {
              setActiveBackendUrl(candidate);
              console.log(`[Diagnostic] Selected backend: ${candidate}`);
            }
            return;
          }
        } catch {
          // Try the next candidate
        }
      }

      if (!cancelled) {
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
      if (Platform.OS === 'ios') {
        try {
          ExpoSpeechRecognitionModule.setCategoryIOS({
            category: 'playAndRecord',
            categoryOptions: [
              'defaultToSpeaker',
              'allowBluetooth',
              'mixWithOthers',
            ],
            mode: 'measurement',
          });
        } catch (err) {
          console.error('Failed to set audio category:', err);
        }
      }
      
      // Small delay to allow the audio session to settle
      setTimeout(() => {
        startWakeWordListening();
      }, 500);
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
              // On iOS, "Enhanced" voices are the high-quality downloaded ones.
              // We also filter out "compact" just in case.
              const isEnhanced = v.quality === 'Enhanced' || v.quality === Speech.VoiceQuality?.Enhanced;
              const isCompact = v.identifier.toLowerCase().includes('compact');
              return isEnhanced && !isCompact;
            }
            
            // On Android, localService indicates it's on-device.
            // Some high-quality voices also have "enhanced" or "premium" in their identifier.
            return v.localService !== false || v.identifier.toLowerCase().includes('enhanced');
          })
          .map(v => ({
            ...v,
            accentLabel: getAccentLabel(v.language)
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        
        setAvailableVoices(englishVoices);

        // Keep existing selection if it's still available, otherwise pick a default
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

    return () => {
      clearTimeout(restartTimerRef.current);
      ExpoSpeechRecognitionModule.stop();
    };
  }, []);

  // --- ACTIONS ---
  async function startWakeWordListening() {
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    modeRef.current = 'wake';
    setStatus('Say "Hey Dairy" to start...');
    
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setStatus('Microphone permission required.');
        isStartingRef.current = false;
        return;
      }

      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        maxAlternatives: 1,
        continuous: true,
        iosCategory: {
          category: 'playAndRecord',
          categoryOptions: [
            'defaultToSpeaker',
            'allowBluetooth',
            'mixWithOthers',
          ],
          mode: 'measurement',
        }
      });
    } catch (err) {
      console.error('Failed to start wake word listening', err);
      scheduleRestart('error');
    } finally {
      isStartingRef.current = false;
    }
  }

  async function triggerCommandPrompt() {
    isStartingRef.current = false; // Allow manual interruption
    // Switch to transition mode while we speak the prompt
    modeRef.current = 'transition';
    setStatus('Readying...');
    
    // Clear the wake word transcript so it's not sent to the backend
    setTranscript('');
    transcriptRef.current = '';
    
    // Stop current listening to speak clearly
    ExpoSpeechRecognitionModule.stop();
    
    Speech.speak('Yes', { 
      rate: 1.1, 
      voice: preferredVoiceRef.current,
      onDone: () => startCommandListening(),
      onError: () => startCommandListening()
    });
  }

  async function startCommandListening(isFollowUp = false) {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    
    clearTimeout(listeningTimeoutRef.current);

    modeRef.current = 'command';
    setStatus(isFollowUp ? 'Listening (5s follow-up)...' : 'Listening for command...');
    
    try {
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        maxAlternatives: 1,
        continuous: true,
        iosCategory: {
          category: 'playAndRecord',
          categoryOptions: [
            'defaultToSpeaker',
            'allowBluetooth',
            'mixWithOthers',
          ],
          mode: 'measurement',
        }
      });

      if (isFollowUp) {
        // Automatically stop after 5 seconds if silence detection hasn't already
        listeningTimeoutRef.current = setTimeout(() => {
          if (modeRef.current === 'command') {
            console.log('[Bessie] Follow-up timeout reached. Stopping.');
            ExpoSpeechRecognitionModule.stop();
          }
        }, 5000);
      }
    } catch (err) {
      console.error('Failed to start command listening', err);
      startWakeWordListening();
    } finally {
      isStartingRef.current = false;
    }
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

    try {
      // We'll hit /api/voice-chat as per user snippet
      const response = await fetch(`${activeBackendUrlRef.current}/api/voice-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transcript: finalTranscript }),
      });

      const rawBody = await response.text();
      let data = {};
      if (rawBody) {
        try {
          data = JSON.parse(rawBody);
        } catch {
          data = { summary: rawBody };
        }
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${data?.error ?? data?.summary ?? 'Request failed'}`);
      }

      // Handle both 'summary' (from snippet) and 'response' (from current backend)
      const receivedSummary = data.summary ?? data.response ?? 'No answer obtained.';
      setServerMessage(receivedSummary);
      setStatus('Playing response...');
      
      Speech.speak(receivedSummary, {
        rate: 1.0,
        voice: preferredVoiceRef.current,
        onDone: () => startCommandListening(true), // Direct follow-up!
        onError: () => startWakeWordListening(),
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setRequestError(message);
      setStatus('Error');
      Alert.alert('Voice API failed', message);
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

  return (
    <View style={styles.container}>
      <Text style={styles.header}>🐄 Bessie</Text>
      <Text style={styles.subtitle}>Farm Voice Assistant</Text>

      <View style={styles.statusBox}>
        <Text style={styles.statusLabel}>STATUS</Text>
        <Text style={styles.statusText}>{status}</Text>
        {modeRef.current === 'command' && transcript.length > 0 && (
          <View style={styles.transcriptContainer}>
            <ScrollView style={styles.transcriptScroll} contentContainerStyle={styles.transcriptScrollContent}>
              <Text style={styles.partialTranscript}>"{transcript}"</Text>
            </ScrollView>
          </View>
        )}
        {(recognizing || loading) && (
          <ActivityIndicator size="small" color="#4ade80" style={styles.indicator} />
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

      <TouchableOpacity 
        style={styles.voiceButton} 
        onPress={() => setIsModalVisible(true)}
      >
        <Text style={styles.voiceButtonText}>🗣️ Change Voice</Text>
      </TouchableOpacity>

      <Text style={styles.hint}>Say "Hey Dairy" to start hands-free</Text>

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
    maxHeight: 200, // Limit height to make it scrollable
  },
  responseScroll: {
    width: '100%',
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


