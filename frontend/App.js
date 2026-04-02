import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Platform, LogBox, ScrollView, Alert, Animated, TextInput, KeyboardAvoidingView, Keyboard, SafeAreaView, Dimensions, LayoutAnimation, UIManager } from 'react-native';
import { registerRootComponent } from 'expo';
import { StatusBar } from 'expo-status-bar';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';

import {
  WAKE_PHRASES,
  EXIT_PHRASES,
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
  const [manualText, setManualText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activeTab, setActiveTab] = useState('voice');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const modeRef = useRef('wake'); // 'wake' | 'command' | 'transition'
  const isStartingRef = useRef(false);
  const silentSoundRef = useRef(null);
  const speakTimeoutRef = useRef(null);
  const restartTimerRef = useRef(null);
  const horizontalScrollRef = useRef(null);

  // Sync refs
  useEffect(() => { preferredVoiceRef.current = preferredVoice; }, [preferredVoice]);
  useEffect(() => { activeBackendUrlRef.current = activeBackendUrl; }, [activeBackendUrl]);

  const {
    loading,
    setLoading,
    requestError,
    setRequestError,
    serverMessage: voiceServerMessage,
    setServerMessage: setVoiceServerMessage,
    sendTranscriptToBackend,
    sendRecordingToBackend
  } = useWhisperApi(activeBackendUrl);

  const [textServerMessage, setTextServerMessage] = useState('');

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

  const onPartial = useCallback((txt) => setVoiceTranscript(txt), []);
  const onResult = useCallback((txt) => {
    setVoiceTranscript(txt);
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
    stopAndGetURI,
    recordingRef
  } = useAudioRecording(onSilence);

  // --- ACTIONS ---
  const startWakeWordListening = useCallback(async () => {
    if (isStartingRef.current || !isModelLoaded) return;
    isStartingRef.current = true;

    try {
      await cleanupAudio(recordingRef, null, { stopVosk: true });
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
      await startVosk();
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

    Speech.speak('Moooooo', {
      rate: 1.1,
      voice: preferredVoiceRef.current,
      onDone: () => setTimeout(() => startCommandListening(), 300),
      onError: () => setTimeout(() => startCommandListening(), 300)
    });
  }, [stopVosk, startCommandListening]);

  const startCommandListening = useCallback(async (isFollowUp = false) => {
    modeRef.current = 'command';
    setStatus(isFollowUp ? 'Listening (Whisper)...' : 'Listening... (Whisper)');
    setVoiceTranscript('(Recording audio...)');

    await cleanupAudio(recordingRef, null, { stopVosk: false });
    await startVosk(EXIT_PHRASES); // Only listen for exit phrases locally during whisper
    await startRecording();
  }, [startVosk, startRecording, recordingRef]);

  const processBackendResult = useCallback(async (data, isText = false) => {
    try {
      if (data.transcript) {
        if (isText) setTextTranscript(data.transcript);
        else setVoiceTranscript(data.transcript);
      }

      const summary = data.summary || data.response;
      if (isText) setTextServerMessage(summary);
      else setVoiceServerMessage(summary);

      // Handle AI response and TTS
      if (summary) {
        if (data.exit) {
          console.log('[Bessie] Exit phrase detected. Skipping speech and restarting wake listener.');
          void stopDucking(silentSoundRef);
          startWakeWordListening();
          return;
        }

        setStatus('Playing response...');
        const bestVoiceMatch = availableVoices.find(v => v.language.startsWith(selectedLanguage.voicePrefix));
        const voiceId = bestVoiceMatch ? bestVoiceMatch.identifier : preferredVoiceRef.current;

        console.log(`[Speech] Starting speak summary... (Voice: ${voiceId})`);

        // Safety timeout for speech hanging
        const speechSafetyTimeout = setTimeout(() => {
          if (modeRef.current === 'transition' || status === 'Playing response...') {
            console.warn('[Speech] Safety backup triggered - speech took too long or failed to fire onDone.');
            startWakeWordListening();
          }
        }, 15000);

        Speech.speak(data.summary, {
          rate: 1.0,
          voice: voiceId,
          onStart: () => console.log('[Speech] onStart triggered'),
          onDone: () => {
            console.log('[Speech] onDone triggered');
            clearTimeout(speechSafetyTimeout);
            void stopDucking(silentSoundRef);
            if (data.exit) startWakeWordListening();
            else speakTimeoutRef.current = setTimeout(() => startCommandListening(true), 500);
          },
          onError: (e) => {
            console.error('[Speech] onError triggered:', e);
            clearTimeout(speechSafetyTimeout);
            void stopDucking(silentSoundRef);
            startWakeWordListening();
          },
        });
      } else {
        // No summary, just go back to wake
        startWakeWordListening();
      }
    } catch (error) {
      console.error('[Bessie] Error processing backend response:', error);
      startWakeWordListening();
    }
  }, [availableVoices, selectedLanguage.voicePrefix, preferredVoiceRef, silentSoundRef, startWakeWordListening, startCommandListening, status]);

  const stopAndSendRecording = useCallback(async () => {
    try {
      const uri = await stopAndGetURI();
      if (!uri) {
        startWakeWordListening();
        return;
      }

      void startDucking(silentSoundRef);
      const data = await sendRecordingToBackend(uri, selectedLanguage.code);
      await processBackendResult(data);
    } catch (error) {
      void stopDucking(silentSoundRef);
      Alert.alert('API failed', error.message);
      startWakeWordListening();
    }
  }, [stopAndGetURI, sendRecordingToBackend, selectedLanguage.code, processBackendResult, startWakeWordListening]);

  const handleSendManualText = async () => {
    if (!manualText.trim()) return;

    const textToSend = manualText.trim();
    setManualText('');
    setIsTyping(false);
    Keyboard.dismiss();

    try {
      setStatus('Sending text...');
      setTextTranscript(textToSend);
      transcriptRef.current = textToSend;

      // Stop anything current
      await cleanupAudio(recordingRef, null, { stopVosk: true });
      void startDucking(silentSoundRef);

      const data = await sendTranscriptToBackend(textToSend, selectedLanguage.code);
      if (data) {
        await processBackendResult(data, true);
      }
    } catch (error) {
      void stopDucking(silentSoundRef);
      Alert.alert('Text API failed', error.message);
      startWakeWordListening();
    }
  };

  const handleStopChat = async () => {
    clearTimeout(restartTimerRef.current);
    clearTimeout(speakTimeoutRef.current);
    Speech.stop();
    await cleanupAudio(recordingRef, null, { stopVosk: true });

    modeRef.current = 'wake';
    setStatus('Stopped');
    setVolume(0);
    setVoiceTranscript('');
    setTextTranscript('');
    setVoiceServerMessage('');
    setTextServerMessage('');

    setTimeout(() => {
      void stopDucking(silentSoundRef);
      startWakeWordListening();
    }, 1200);
  };

  const onTabPress = (tabId) => {
    setActiveTab(tabId);
    const index = tabId === 'text' ? 0 : tabId === 'voice' ? 1 : 2;
    horizontalScrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
  };

  const onHorizontalScroll = (event) => {
    const x = event.nativeEvent.contentOffset.x;
    const index = Math.round(x / SCREEN_WIDTH);
    const newTab = index === 0 ? 'text' : index === 1 ? 'voice' : 'settings';
    if (newTab !== activeTab) {
      setActiveTab(newTab);
    }
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

  // Start/Stop listening based on tab and model state
  useEffect(() => {
    if (activeTab === 'voice' && isModelLoaded) {
      startWakeWordListening();
    } else {
      cleanupAudio(recordingRef, null, { stopVosk: true });
      void stopDucking(silentSoundRef);
      setStatus('Paused');
    }
  }, [activeTab, isModelLoaded]);

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
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" backgroundColor="#0f1117" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <ScrollView
          ref={horizontalScrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onHorizontalScroll}
          contentOffset={{ x: SCREEN_WIDTH, y: 0 }} // Start on 'voice' tab (index 1)
          bounces={false}
        >
          {/* TEXT TAB */}
          <View style={styles.page}>
            <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.header}>🐄 Bessie</Text>
              <Text style={styles.subtitle}>Farm Chat</Text>

              {textTranscript.length > 0 && (
                <View style={styles.userMessageBox}>
                  <Text style={styles.userMessageLabel}>You Said</Text>
                  <Text style={styles.userMessageText}>{textTranscript}</Text>
                </View>
              )}
              <ResponseDisplay
                serverMessage={textServerMessage}
                requestError={requestError}
              />
              <ManualTextInput
                value={manualText}
                onChangeText={setManualText}
                onSend={handleSendManualText}
                disabled={loading || !!recording}
                onFocus={() => setIsKeyboardVisible(true)}
                onBlur={() => setIsKeyboardVisible(false)}
              />
            </ScrollView>
          </View>

          {/* VOICE TAB */}
          <View style={styles.page}>
            <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.header}>🐄 Bessie</Text>
              <Text style={styles.subtitle}>Farm Voice Assistant</Text>

              <StatusDisplay
                status={status}
                mode={modeRef.current}
                recognizing={recognizing}
                loading={loading}
                recording={recording}
                volume={volume}
                transcript={voiceTranscript}
              />
              <ResponseDisplay
                serverMessage={voiceServerMessage}
                requestError={requestError}
              />

              <TouchableOpacity style={styles.button} onPress={triggerCommandPrompt}>
                <Text style={styles.buttonText}>🎙️ Manual Trigger</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.stopButton} onPress={handleStopChat}>
                <Text style={styles.stopButtonText}>🛑 Stop Bessie</Text>
              </TouchableOpacity>

              <Text style={styles.hint}>Say "Hey Dairy" to start hands-free</Text>
            </ScrollView>
          </View>

          {/* SETTINGS TAB */}
          <View style={styles.page}>
            <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.header}>🐄 Bessie</Text>
              <Text style={styles.subtitle}>Configuration</Text>

              <View style={styles.settingsPage}>
                <Text style={styles.sectionHeader}>Bessie Settings</Text>

                <View style={styles.settingCard}>
                  <Text style={styles.settingLabel}>Language</Text>
                  <TouchableOpacity style={styles.voiceButton} onPress={() => setIsLangModalVisible(true)}>
                    <Text style={styles.voiceButtonText}>🌐 {selectedLanguage.label}</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.settingCard}>
                  <Text style={styles.settingLabel}>Voice & Accessibility</Text>
                  <TouchableOpacity style={styles.voiceButton} onPress={() => setIsModalVisible(true)}>
                    <Text style={styles.voiceButtonText}>🗣️ Speaker Voice Profile</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.statusBox}>
                  <Text style={styles.statusLabel}>Backend Endpoint</Text>
                  <Text style={styles.statusText}>{activeBackendUrl}</Text>
                </View>
              </View>
            </ScrollView>
          </View>
        </ScrollView>

        {!isKeyboardVisible && <TabBar activeTab={activeTab} onTabPress={onTabPress} />}
      </KeyboardAvoidingView>

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
  page: { width: SCREEN_WIDTH, backgroundColor: '#0f1117' },
  scrollContainer: {
    flexGrow: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f1117'
  },
  header: { fontSize: 40, fontWeight: 'bold', color: '#ffffff', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 40, letterSpacing: 2, textTransform: 'uppercase' },
  button: { backgroundColor: '#16a34a', paddingVertical: 16, paddingHorizontal: 40, borderRadius: 50, marginBottom: 12, width: '100%', alignItems: 'center' },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  stopButton: { backgroundColor: '#991b1b', paddingVertical: 14, paddingHorizontal: 40, borderRadius: 50, marginBottom: 20, borderWidth: 1, borderColor: '#7f1d1d', width: '100%', alignItems: 'center' },
  stopButtonText: { color: '#fecaca', fontSize: 15, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 },
  settingsPage: { width: '100%', alignItems: 'flex-start' },
  sectionHeader: { fontSize: 20, fontWeight: '600', color: '#ffffff', marginBottom: 20, width: '100%' },
  settingCard: { width: '100%', backgroundColor: '#1f2937', padding: 20, borderRadius: 16, marginBottom: 15, borderWidth: 1, borderColor: '#374151' },
  settingLabel: { fontSize: 11, color: '#6b7280', letterSpacing: 1.5, marginBottom: 12, textTransform: 'uppercase' },
  settingsRow: { flexDirection: 'row', gap: 10, width: '100%' },
  voiceButton: { width: '100%', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: '#4b5563', backgroundColor: '#111827', alignItems: 'center' },
  voiceButtonText: { color: '#e5e7eb', fontSize: 14, textAlign: 'center' },
  hint: { fontSize: 12, color: '#4b5563', textAlign: 'center', marginBottom: 20 },
  errorText: { color: '#ef4444', marginBottom: 10 },
  userMessageBox: { backgroundColor: '#111827', borderRadius: 16, padding: 20, width: '100%', marginBottom: 15, borderWidth: 1, borderColor: '#374151', alignSelf: 'flex-start' },
  userMessageLabel: { fontSize: 11, color: '#9ca3af', letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase' },
  userMessageText: { fontSize: 15, color: '#ffffff' },
  statusBox: { backgroundColor: '#1f2937', borderRadius: 16, padding: 20, width: '100%', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#374151' },
  statusLabel: { fontSize: 11, color: '#6b7280', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' },
  statusText: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
  hint: { fontSize: 12, color: '#4b5563', textAlign: 'center', marginBottom: 20 },
  errorText: { color: '#ef4444', marginBottom: 10 },
});

registerRootComponent(App);
