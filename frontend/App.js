import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Platform, LogBox, ScrollView, Alert, Animated, TextInput, KeyboardAvoidingView, Keyboard, SafeAreaView, Dimensions, LayoutAnimation, UIManager, PanResponder, Switch } from 'react-native';
import { registerRootComponent } from 'expo';
import { StatusBar } from 'expo-status-bar';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';

import {
  WAKE_PHRASES,
  EXIT_PHRASES,
  FILLER_WORDS,
  LANGUAGES,
  configuredBackendUrl,
  getBackendCandidates,
  getAccentLabel
} from './src/config/constants';

import { useVosk } from './src/hooks/useVosk';
import { useAudioRecording } from './src/hooks/useAudioRecording';
import { useWhisperApi } from './src/hooks/useWhisperApi';
import { startDucking, stopDucking, cleanupAudio } from './src/utils/audioUtils';

// Components
import Visualizer from './src/components/Visualizer';
import LanguageSelectorModal from './src/components/LanguageSelectorModal';
import VoiceSelectorModal from './src/components/VoiceSelectorModal';
import ManualTextInput from './src/components/ManualTextInput';
import StatusDisplay from './src/components/StatusDisplay';
import ResponseDisplay from './src/components/ResponseDisplay';
import TabBar from './src/components/TabBar';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function App() {
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [textTranscript, setTextTranscript] = useState('');
  const transcriptRef = useRef('');
  const [activeBackendUrl, setActiveBackendUrl] = useState(configuredBackendUrl);
  const activeBackendUrlRef = useRef(configuredBackendUrl);

  const [preferredVoice, setPreferredVoice] = useState(null);
  const preferredVoiceRef = useRef(null);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [selectedLanguage, setSelectedLanguage] = useState(LANGUAGES[0]);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isLangModalVisible, setIsLangModalVisible] = useState(false);
  const [messages, setMessages] = useState([
    { id: 'initial', role: 'assistant', text: 'Hello! I am Bessie, your farm assistant. How can I help you today?' }
  ]);
  const [activeTab, setActiveTab] = useState('chat');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isChatTtsEnabled, setIsChatTtsEnabled] = useState(true);
  const recBarAnim = useRef(new Animated.Value(-100)).current;
  const [isListeningActive, setIsListeningActive] = useState(true);
  const isListeningActiveRef = useRef(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speechQueueRef = useRef([]);
  const streamingSentenceBufferRef = useRef('');

  const menuAnim = useRef(new Animated.Value(-SCREEN_WIDTH * 0.8)).current;
  const scrollRef = useRef(null);
  const swipeResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Trigger if starting from the left edge and moving right
        return !isMenuOpen &&
          evt.nativeEvent.pageX < 50 &&
          gestureState.dx > 10 &&
          Math.abs(gestureState.dy) < 30;
      },
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.dx > 0) {
          const val = -SCREEN_WIDTH * 0.8 + gestureState.dx;
          menuAnim.setValue(val > 0 ? 0 : val);
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dx > SCREEN_WIDTH * 0.25) {
          toggleMenu(true);
        } else {
          toggleMenu(false);
        }
      },
    })
  ).current;

  const modeRef = useRef('wake'); // 'wake' | 'command' | 'transition'
  const isStartingRef = useRef(false);
  const silentSoundRef = useRef(null);
  const speakTimeoutRef = useRef(null);
  const restartTimerRef = useRef(null);
  const horizontalScrollRef = useRef(null);

  // Sync refs
  useEffect(() => { preferredVoiceRef.current = preferredVoice; }, [preferredVoice]);
  useEffect(() => { activeBackendUrlRef.current = activeBackendUrl; }, [activeBackendUrl]);
  useEffect(() => { isListeningActiveRef.current = isListeningActive; }, [isListeningActive]);

  const {
    loading,
    setLoading,
    requestError,
    setRequestError,
    streamText,
    streamAudio
  } = useWhisperApi(activeBackendUrl);

  const getFormattedHistory = useCallback((limit = 8) => {
    // Convert {id, role, text} to {role, content} and skip the initial message if desired, 
    // or just send the last N messages.
    return messages
      .slice(-limit)
      .map(m => ({ role: m.role, content: m.text }));
  }, [messages]);

  const setManualText = (txt) => {
    setVoiceTranscript(txt);
  };

  const onWakeWord = useCallback((phrase) => {
    if (!isStartingRef.current) {
      console.log('[Vosk] Wake phrase detected:', phrase);
      triggerCommandPrompt();
    }
  }, []);

  const onExit = useCallback((phrase) => {
    console.log('[Vosk] Local exit keyword detected:', phrase);
    handleStopChat();
  }, []);

  const onPartial = useCallback((_txt) => { }, []);
  const onResult = useCallback((txt) => {
    transcriptRef.current = txt;
  }, []);

  const {
    status,
    setStatus,
    isModelLoaded,
    recognizing,
    setRecognizing,
    startVosk,
    stopVosk
  } = useVosk(onWakeWord, onExit, onPartial, onResult);

  const onSilence = useCallback(() => {
    console.log('[Audio] Silence Timed Out.');
    stopAndSendRecording();
  }, [stopAndSendRecording]);

  const {
    recording,
    volume,
    setVolume,
    startRecording,
    stopRecordingManual,
    stopAndGetURI,
    recordingRef
  } = useAudioRecording(onSilence);

  useEffect(() => {
    const isRec = !!recording;
    console.log('[App] Recording state (from hook):', isRec);
    Animated.timing(recBarAnim, {
      toValue: isRec ? 0 : -200,
      duration: 300,
      useNativeDriver: false
    }).start();
  }, [recording]);

  // --- ACTIONS ---
  const startWakeWordListening = useCallback(async () => {
    if (!isListeningActiveRef.current || isStartingRef.current || !isModelLoaded) {
      if (!isListeningActiveRef.current) setStatus('Listening Disabled');
      return;
    }
    isStartingRef.current = true;

    try {
      await stopVosk();
      await cleanupAudio(recordingRef, null, { stopVosk: false });
      await stopDucking(silentSoundRef);

      if (await Speech.isSpeakingAsync()) {
        scheduleRestart();
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      modeRef.current = 'wake';
      setStatus('Say "Hey Dairy" to start...');
      setVoiceTranscript('');
      transcriptRef.current = '';
      setRecognizing(true);
      await startVosk([...WAKE_PHRASES, ...EXIT_PHRASES, ...FILLER_WORDS]); // Noise-reduced grammar to avoid false triggers while saving battery
    } catch (err) {
      setRecognizing(false);
      scheduleRestart();
    } finally {
      isStartingRef.current = false;
    }
  }, [isModelLoaded, startVosk, recordingRef, silentSoundRef, scheduleRestart]);

  const triggerCommandPrompt = useCallback(async () => {
    isStartingRef.current = false;
    modeRef.current = 'transition';
    setStatus('Readying...');
    setVoiceTranscript('');
    transcriptRef.current = '';

    await stopVosk();
    await new Promise(r => setTimeout(r, 100));

    const beepDone = () => {
      clearTimeout(safetyBeepTimeout);
      setTimeout(() => startCommandListening(), 300);
    };

    const safetyBeepTimeout = setTimeout(beepDone, 1500);

    Speech.speak('Moooooo', {
      rate: 1.1,
      voice: preferredVoiceRef.current,
      onDone: beepDone,
      onError: beepDone
    });
  }, [stopVosk, startCommandListening]);

  const startCommandListening = useCallback(async (isFollowUp = false) => {
    modeRef.current = 'command';
    setStatus(isFollowUp ? 'Listening (Whisper)...' : 'Listening... (Whisper)');

    await cleanupAudio(recordingRef, null, { stopVosk: false });
    await startVosk([...EXIT_PHRASES, ...FILLER_WORDS]); // Listen for exits and noise to stay efficient (no full model)
    await startRecording();
  }, [startVosk, startRecording, recordingRef]);

  const speakNextSentence = useCallback(() => {
    if (isSpeaking || speechQueueRef.current.length === 0) return;

    const sentence = speechQueueRef.current.shift();
    if (!sentence || sentence.trim().length === 0) {
      speakNextSentence();
      return;
    }

    setIsSpeaking(true);
    const bestVoiceMatch = availableVoices.find(v => v.language.startsWith(selectedLanguage.voicePrefix));
    const voiceId = bestVoiceMatch ? bestVoiceMatch.identifier : preferredVoiceRef.current;

    Speech.speak(sentence, {
      rate: 1.0,
      voice: voiceId,
      onDone: () => {
        setIsSpeaking(true); // Small hack to prevent immediate re-trigger before state updates
        setTimeout(() => {
          setIsSpeaking(false);
          speakNextSentence();
        }, 50);
      },
      onError: () => {
        setIsSpeaking(false);
        speakNextSentence();
      },
    });
  }, [isSpeaking, availableVoices, selectedLanguage.voicePrefix, preferredVoiceRef]);

  const stopAndSendRecording = useCallback(async () => {
    try {
      const uri = await stopAndGetURI();
      if (!uri) { startWakeWordListening(); return; }

      void startDucking(silentSoundRef);
      setStatus('Thinking...');

      const assistantId = Date.now().toString() + '_ai';
      setMessages(prev => [...prev, { id: assistantId, role: 'assistant', text: '' }]);

      let fullResponse = '';
      streamingSentenceBufferRef.current = '';
      speechQueueRef.current = [];

      await streamAudio(uri, selectedLanguage.code, getFormattedHistory(8),
        (chunk) => {
          fullResponse += chunk;
          streamingSentenceBufferRef.current += chunk;
          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, text: fullResponse } : m));

          let match;
          while ((match = streamingSentenceBufferRef.current.match(/^(.*?[.!?\n])(.*)$/s))) {
            const toSpeak = match[1].trim();
            streamingSentenceBufferRef.current = match[2];
            if (toSpeak) {
              speechQueueRef.current.push(toSpeak);
              speakNextSentence();
            }
          }
        },
        (transcript) => {
          // Received transcript, add user message bubble
          setMessages(prev => {
            const userMsg = { id: Date.now().toString(), role: 'user', text: transcript };
            // Insert before the assistant placeholder
            const list = [...prev];
            list.splice(list.length - 1, 0, userMsg);
            return list;
          });
        }
      );

      // Finalize
      if (streamingSentenceBufferRef.current.trim()) {
        speechQueueRef.current.push(streamingSentenceBufferRef.current.trim());
        speakNextSentence();
      }

      const checkDoneInterval = setInterval(() => {
        if (!isSpeaking && speechQueueRef.current.length === 0) {
          clearInterval(checkDoneInterval);
          void stopDucking(silentSoundRef);
          speakTimeoutRef.current = setTimeout(() => startCommandListening(true), 500);
        }
      }, 500);

    } catch (error) {
      void stopDucking(silentSoundRef);
      Alert.alert('Voice API failed', error.message);
      startWakeWordListening();
    }
  }, [stopAndGetURI, streamAudio, selectedLanguage.code, startWakeWordListening, startCommandListening, getFormattedHistory, speakNextSentence, isSpeaking, silentSoundRef]);

  const handleSendManualText = async () => {
    if (!voiceTranscript.trim()) return;
    const textToSend = voiceTranscript.trim();
    setVoiceTranscript('');
    Keyboard.dismiss();

    try {
      setStatus('Sending...');
      const userMsg = { id: Date.now().toString(), role: 'user', text: textToSend };
      setMessages(prev => [...prev, userMsg]);

      await cleanupAudio(recordingRef, null, { stopVosk: true });
      void startDucking(silentSoundRef);

      const assistantId = Date.now().toString() + '_ai';
      setMessages(prev => [...prev, { id: assistantId, role: 'assistant', text: '' }]);

      let fullResponse = '';
      streamingSentenceBufferRef.current = '';
      speechQueueRef.current = [];

      await streamText(textToSend, getFormattedHistory(8), selectedLanguage.code, (chunk) => {
        fullResponse += chunk;
        streamingSentenceBufferRef.current += chunk;
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, text: fullResponse } : m));

        if (isChatTtsEnabled) {
          let match;
          while ((match = streamingSentenceBufferRef.current.match(/^(.*?[.!?\n])(.*)$/s))) {
            const toSpeak = match[1].trim();
            streamingSentenceBufferRef.current = match[2];
            if (toSpeak) {
              speechQueueRef.current.push(toSpeak);
              speakNextSentence();
            }
          }
        }
      });

      if (isChatTtsEnabled && streamingSentenceBufferRef.current.trim()) {
        speechQueueRef.current.push(streamingSentenceBufferRef.current.trim());
        speakNextSentence();
      }

      const checkDoneInterval = setInterval(() => {
        if (!isChatTtsEnabled || (!isSpeaking && speechQueueRef.current.length === 0)) {
          clearInterval(checkDoneInterval);
          void stopDucking(silentSoundRef);
          startWakeWordListening();
        }
      }, 300);
    } catch (error) {
      void stopDucking(silentSoundRef);
      Alert.alert('Text API failed', error.message);
      startWakeWordListening();
    }
  };

  const handleMicPress = useCallback(() => {
    if (!isListeningActiveRef.current) {
      setIsListeningActive(true);
      isListeningActiveRef.current = true;
      // Small pause to allow the master switch to propagate before starting audio
      setTimeout(() => triggerCommandPrompt(), 50).unref?.();
      return;
    }
    if (recording) {
      handleStopChat();
    } else {
      triggerCommandPrompt();
    }
  }, [recording, isListeningActive, handleStopChat, triggerCommandPrompt]);

  const handleStopChat = async () => {
    clearTimeout(restartTimerRef.current);
    clearTimeout(speakTimeoutRef.current);
    Speech.stop();
    await stopVosk();
    await stopRecordingManual();

    modeRef.current = 'wake';
    if (!isListeningActiveRef.current) {
      setStatus('Listening Disabled');
    } else {
      setStatus('Stopped');
    }
    setVolume(0);
    setVoiceTranscript('');
    transcriptRef.current = '';

    setTimeout(() => {
      void stopDucking(silentSoundRef);
      if (isListeningActiveRef.current) {
        startWakeWordListening();
      }
    }, 400);
  };

  const toggleListening = useCallback(async () => {
    const nextState = !isListeningActive;

    if (!nextState) {
      // Disabling: Shut everything down immediately
      setIsListeningActive(false);
      isListeningActiveRef.current = false;
      await handleStopChat();
    } else {
      // Enabling: Turn things back on
      setIsListeningActive(true);
      isListeningActiveRef.current = true;
      startWakeWordListening();
    }
  }, [isListeningActive, handleStopChat, startWakeWordListening]);

  const toggleMenu = (open) => {
    setIsMenuOpen(open);
    Animated.timing(menuAnim, {
      toValue: open ? 0 : -SCREEN_WIDTH * 0.8,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const scheduleRestart = () => {
    clearTimeout(restartTimerRef.current);
    restartTimerRef.current = setTimeout(async () => {
      if (await Speech.isSpeakingAsync()) scheduleRestart();
      else startWakeWordListening();
    }, 1000);
  };

  // --- INITIALIZATION ---
  useEffect(() => {
    const setup = async () => {
      LogBox.ignoreLogs([
        '`new NativeEventEmitter()` was called with a non-null argument without the required `addListener` method',
      ]);

      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          staysActiveInBackground: true,
          interruptionModeIOS: 2,
          interruptionModeAndroid: 2,
        });

        const { sound } = await Audio.Sound.createAsync(
          { uri: 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==' },
          { isLooping: true, volume: 0.1 }
        );
        silentSoundRef.current = sound;
      } catch (err) { console.warn(err); }

      // Pick reachable backend
      for (const candidate of getBackendCandidates()) {
        try {
          const res = await fetch(`${candidate}/health`);
          if (res.ok) { setActiveBackendUrl(candidate); break; }
        } catch (e) { }
      }

      // Load voices
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        const englishVoices = voices
          .filter(v => v.language.toLowerCase().startsWith('en'))
          .map(v => ({ ...v, accentLabel: getAccentLabel(v.language) }))
          .sort((a, b) => a.name.localeCompare(b.name));

        setAvailableVoices(englishVoices);
        if (englishVoices.length > 0) {
          const topVoice = englishVoices.find(v => v.identifier.toLowerCase().includes('premium')) || englishVoices[0];
          setPreferredVoice(topVoice.identifier);
        }
      } catch (err) { }
    };

    setup();
    return () => {
      clearTimeout(restartTimerRef.current);
      stopVosk();
      if (silentSoundRef.current) silentSoundRef.current.unloadAsync();
    };
  }, []);

  useEffect(() => {
    if (isModelLoaded) {
      startWakeWordListening();
    }
  }, [isModelLoaded]);

  // Keyboard listener as safety fallback
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  return (
    <SafeAreaView style={styles.container} {...swipeResponder.panHandlers}>
      <StatusBar style="light" backgroundColor="#0f1117" />


      {/* MAIN CONTENT */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <View style={styles.page}>
          <View style={styles.chatContainer}>
            <View style={styles.chatHeader}>
              <TouchableOpacity onPress={() => toggleMenu(true)}>
                <Text style={styles.menuIcon}>☰</Text>
              </TouchableOpacity>
              <Text style={styles.headerSmall}>🐄 Bessie</Text>
              <TouchableOpacity onPress={toggleListening}>
                <Text style={[styles.stopButtonTextSmall, !isListeningActive && styles.stopButtonDisabledText]}>
                  {isListeningActive ? '🟢 LISTENING' : '🔘 SILENCED'}
                </Text>
              </TouchableOpacity>
            </View>

            <StatusDisplay
              status={status}
              mode={modeRef.current}
              recognizing={recognizing}
              loading={loading}
              recording={recording}
              volume={volume}
              transcript={voiceTranscript}
              compact
            />

            <ScrollView
              ref={scrollRef}
              style={styles.messagesList}
              contentContainerStyle={styles.messagesContent}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              {messages.map((msg) => (
                <View key={msg.id} style={[
                  styles.messageBubble,
                  msg.role === 'user' ? styles.userBubble : styles.assistantBubble
                ]}>
                  <Text style={msg.role === 'user' ? styles.userText : styles.assistantText}>
                    {msg.text}
                  </Text>
                </View>
              ))}
              {loading && (
                <View style={styles.assistantBubble}>
                  <ActivityIndicator color="#6ee7b7" size="small" />
                </View>
              )}
            </ScrollView>

            <View style={styles.inputArea}>
              <ManualTextInput
                value={voiceTranscript}
                onChangeText={setVoiceTranscript}
                onSend={handleSendManualText}
                onVoicePress={handleMicPress}
                disabled={loading}
                isRecording={!!recording}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* SIDE MENU (DRAWER) */}
      {isMenuOpen && (
        <TouchableOpacity
          style={styles.drawerDimmer}
          activeOpacity={1}
          onPress={() => toggleMenu(false)}
        />
      )}
      <Animated.View style={[styles.drawer, { transform: [{ translateX: menuAnim }] }]}>
        <View style={styles.drawerHeader}>
          <Text style={styles.drawerTitle}>🐄 Bessie</Text>
          <TouchableOpacity onPress={() => toggleMenu(false)}>
            <Text style={styles.menuIcon}>❮</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.drawerContent}>
          <Text style={styles.drawerSectionLabel}>CONFIGURATION</Text>

          <View style={styles.drawerItem}>
            <Text style={styles.settingLabel}>Language</Text>
            <TouchableOpacity style={styles.voiceButton} onPress={() => setIsLangModalVisible(true)}>
              <Text style={styles.voiceButtonText}>🌐 {selectedLanguage.label}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.drawerItem}>
            <Text style={styles.settingLabel}>Voice Profile</Text>
            <TouchableOpacity style={styles.voiceButton} onPress={() => setIsModalVisible(true)}>
              <Text style={styles.voiceButtonText}>🗣️ Speaker Profile</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.drawerItem}>
            <Text style={styles.settingLabel}>Text Chat Audio</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <Text style={{ color: '#9ca3af', fontSize: 13 }}>{isChatTtsEnabled ? 'Enabled' : 'Disabled'}</Text>
              <Switch
                value={isChatTtsEnabled}
                onValueChange={setIsChatTtsEnabled}
                thumbColor={isChatTtsEnabled ? '#2ecc71' : '#f4f3f4'}
                trackColor={{ false: '#3e3e3e', true: '#10b981' }}
              />
            </View>
          </View>

          <View style={styles.statusBoxSmall}>
            <Text style={styles.statusLabelSmall}>Backend Endpoint</Text>
            <Text style={styles.statusTextSmall}>{activeBackendUrl}</Text>
          </View>

          <TouchableOpacity style={styles.stopButton} onPress={() => { handleStopChat(); toggleMenu(false); }}>
            <Text style={styles.stopButtonText}>Emergency Stop</Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>

      <LanguageSelectorModal
        isVisible={isLangModalVisible}
        selectedLanguage={selectedLanguage}
        onSelect={(lang) => { setSelectedLanguage(lang); setIsLangModalVisible(false); setServerMessage(''); }}
        onClose={() => setIsLangModalVisible(false)}
      />

      <VoiceSelectorModal
        isVisible={isModalVisible}
        availableVoices={availableVoices}
        preferredVoice={preferredVoice}
        onSelect={(id) => { setPreferredVoice(id); setIsModalVisible(false); Speech.speak("Voice selected.", { voice: id }); }}
        onClose={() => setIsModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1117' },
  keyboardAvoidingView: { flex: 1, backgroundColor: '#0f1117' },
  page: { width: SCREEN_WIDTH, flex: 1, backgroundColor: '#0f1117' },
  chatContainer: { flex: 1, width: '100%' },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 10, // Ensure header is visible below notch/status bar
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
    backgroundColor: '#0f1117'
  },
  headerSmall: { fontSize: 18, fontWeight: 'bold', color: '#ffffff', letterSpacing: 0.5 },
  menuIcon: { fontSize: 24, color: '#ffffff', padding: 5 },
  stopButtonTextSmall: { color: '#6ee7b7', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 },
  stopButtonDisabledText: { color: '#6b7280' },
  messagesList: { flex: 1, paddingHorizontal: 16 },
  messagesContent: { paddingVertical: 20 },
  messageBubble: {
    maxWidth: '85%',
    padding: 14,
    borderRadius: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#3b82f6',
    borderBottomRightRadius: 4
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#1f2937',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#374151'
  },
  userText: { color: '#ffffff', fontSize: 16, fontWeight: '500' },
  assistantText: { color: '#e5e7eb', fontSize: 16, lineHeight: 22 },
  inputArea: {
    paddingHorizontal: 16,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
    backgroundColor: '#010101', // Slightly darker to contrast with history
    paddingBottom: Platform.OS === 'ios' ? 32 : 24
  },
  drawerDimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 100,
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: SCREEN_WIDTH * 0.8,
    backgroundColor: '#111827',
    zIndex: 101,
    paddingTop: Platform.OS === 'android' ? 40 : 60,
    borderRightWidth: 1,
    borderRightColor: '#1f2937'
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 30
  },
  drawerTitle: { fontSize: 24, fontWeight: 'bold', color: '#ffffff' },
  drawerContent: { paddingHorizontal: 20 },
  drawerSectionLabel: {
    fontSize: 11,
    color: '#6b7280',
    letterSpacing: 2,
    marginBottom: 20,
    textTransform: 'uppercase'
  },
  drawerItem: { marginBottom: 25 },
  statusBoxSmall: {
    backgroundColor: '#1f2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#374151'
  },
  statusLabelSmall: { fontSize: 10, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 },
  statusTextSmall: { fontSize: 13, color: '#9ca3af' },
  stopButton: {
    backgroundColor: '#1f2937',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#ef4444'
  },
  stopButtonText: { color: '#ef4444', fontWeight: 'bold' },
  recordingBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30, // Lower it slightly to ensure it clears the Android status bar area
    left: 20,
    right: 20,
    backgroundColor: '#ef4444',
    paddingVertical: 10,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 10,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginRight: 10,
  },
  recordingText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 0.5,
  },
});

registerRootComponent(App);
