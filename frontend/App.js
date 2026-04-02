import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Platform, LogBox, ScrollView, Alert, Animated } from 'react-native';
import { registerRootComponent } from 'expo';
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

export default function App() {
  const [transcript, setTranscript] = useState('');
  const transcriptRef = useRef('');
  const [activeBackendUrl, setActiveBackendUrl] = useState(configuredBackendUrl);
  const activeBackendUrlRef = useRef(configuredBackendUrl);

  const [preferredVoice, setPreferredVoice] = useState(null);
  const preferredVoiceRef = useRef(null);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [selectedLanguage, setSelectedLanguage] = useState(LANGUAGES[0]);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isLangModalVisible, setIsLangModalVisible] = useState(false);

  const modeRef = useRef('wake'); // 'wake' | 'command' | 'transition'
  const isStartingRef = useRef(false);
  const silentSoundRef = useRef(null);
  const speakTimeoutRef = useRef(null);
  const restartTimerRef = useRef(null);

  // Sync refs
  useEffect(() => { preferredVoiceRef.current = preferredVoice; }, [preferredVoice]);
  useEffect(() => { activeBackendUrlRef.current = activeBackendUrl; }, [activeBackendUrl]);

  const {
    loading,
    setLoading,
    requestError,
    setRequestError,
    serverMessage,
    setServerMessage,
    sendTranscriptToBackend,
    sendRecordingToBackend
  } = useWhisperApi(activeBackendUrl);

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

  const onPartial = useCallback((txt) => setTranscript(txt), []);
  const onResult = useCallback((txt) => {
    setTranscript(txt);
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
  async function startWakeWordListening() {
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
      setTranscript('');
      transcriptRef.current = '';
      setRecognizing(true);
      await startVosk();
    } catch (err) {
      setRecognizing(false);
      scheduleRestart();
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

    await stopVosk();
    await new Promise(r => setTimeout(r, 100));

    Speech.speak('Moooooo', {
      rate: 1.1,
      voice: preferredVoiceRef.current,
      onDone: () => setTimeout(() => startCommandListening(), 300),
      onError: () => setTimeout(() => startCommandListening(), 300)
    });
  }

  async function startCommandListening(isFollowUp = false) {
    modeRef.current = 'command';
    setStatus(isFollowUp ? 'Listening (Whisper)...' : 'Listening... (Whisper)');
    setTranscript('(Recording audio...)');

    await cleanupAudio(recordingRef, null, { stopVosk: false });
    await startVosk(EXIT_PHRASES); // Only listen for exit phrases locally during whisper
    await startRecording();
  }

  const stopAndSendRecording = useCallback(async () => {
    try {
      const uri = await stopAndGetURI();
      if (!uri) {
        startWakeWordListening();
        return;
      }
      
      void startDucking(silentSoundRef);
      const data = await sendRecordingToBackend(uri, selectedLanguage.code);
      
      if (data.transcript) setTranscript(data.transcript);

      // Handle AI response and TTS
      if (data.summary) {
        setStatus('Playing response...');
        const bestVoiceMatch = availableVoices.find(v => v.language.startsWith(selectedLanguage.voicePrefix));
        const voiceId = bestVoiceMatch ? bestVoiceMatch.identifier : preferredVoiceRef.current;

        Speech.speak(data.summary, {
          rate: 1.0,
          voice: voiceId,
          onDone: () => {
            void stopDucking(silentSoundRef);
            if (data.exit) startWakeWordListening();
            else speakTimeoutRef.current = setTimeout(() => startCommandListening(true), 500);
          },
          onError: () => {
            void stopDucking(silentSoundRef);
            startWakeWordListening();
          },
        });
      }
    } catch (error) {
      void stopDucking(silentSoundRef);
      Alert.alert('API failed', error.message);
      startWakeWordListening();
    }
  }, [stopAndGetURI, sendRecordingToBackend, selectedLanguage.code, availableVoices, startWakeWordListening, startCommandListening]);

  const handleStopChat = async () => {
    clearTimeout(restartTimerRef.current);
    clearTimeout(speakTimeoutRef.current);
    Speech.stop();
    await cleanupAudio(recordingRef, null, { stopVosk: true });

    modeRef.current = 'wake';
    setStatus('Stopped');
    setVolume(0);
    setTranscript('');
    setServerMessage('');

    setTimeout(() => {
      void stopDucking(silentSoundRef);
      startWakeWordListening();
    }, 1200);
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

  // Start listening only when model is ready
  useEffect(() => { if (isModelLoaded) startWakeWordListening(); }, [isModelLoaded]);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>🐄 Bessie</Text>
      <Text style={styles.subtitle}>Farm Voice Assistant</Text>

      <View style={styles.statusBox}>
        <Text style={styles.statusLabel}>STATUS</Text>
        <Text style={styles.statusText}>{status}</Text>
        {modeRef.current !== 'transition' && transcript.length > 0 && (
          <ScrollView style={styles.transcriptContainer} contentContainerStyle={styles.transcriptScrollContent}>
            <Text style={styles.partialTranscript}>“{transcript}”</Text>
          </ScrollView>
        )}
        {(recognizing || loading || !!recording) && (
          <View style={styles.centerRow}>
            <ActivityIndicator size="small" color="#4ade80" />
            <Visualizer volume={volume} isActive={!!recording} />
          </View>
        )}
      </View>

      {serverMessage.length > 0 && (
        <View style={styles.responseBox}>
          <Text style={styles.responseLabel}>Bessie Says</Text>
          <ScrollView style={styles.responseTextContainer}>
            <Text style={styles.responseText}>{serverMessage}</Text>
          </ScrollView>
        </View>
      )}

      {requestError.length > 0 && <Text style={styles.errorText}>{requestError}</Text>}

      <TouchableOpacity style={styles.button} onPress={triggerCommandPrompt}>
        <Text style={styles.buttonText}>🎙️ Manual Trigger</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.stopButton} onPress={handleStopChat}>
        <Text style={styles.stopButtonText}>🛑 Stop Bessie</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.voiceButton} onPress={() => setIsLangModalVisible(true)}>
        <Text style={styles.voiceButtonText}>🌐 Language: {selectedLanguage.label}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.voiceButton} onPress={() => setIsModalVisible(true)}>
        <Text style={styles.voiceButtonText}>🗣️ Speaker Voice</Text>
      </TouchableOpacity>

      <Text style={styles.hint}>Say "Hey Dairy" to start hands-free</Text>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 32, backgroundColor: '#0f1117', alignItems: 'center', justifyContent: 'center' },
  header: { fontSize: 40, fontWeight: 'bold', color: '#ffffff', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 40, letterSpacing: 2, textTransform: 'uppercase' },
  statusBox: { backgroundColor: '#1f2937', borderRadius: 16, padding: 20, width: '100%', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#374151' },
  statusLabel: { fontSize: 11, color: '#6b7280', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' },
  statusText: { fontSize: 16, color: '#e5e7eb', textAlign: 'center' },
  centerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  transcriptContainer: { maxHeight: 100, width: '100%', marginTop: 8 },
  transcriptScrollContent: { alignItems: 'center' },
  partialTranscript: { fontSize: 14, color: '#4ade80', fontStyle: 'italic', textAlign: 'center', paddingHorizontal: 12 },
  responseBox: { backgroundColor: '#064e3b', borderRadius: 16, padding: 20, width: '100%', marginBottom: 30, borderWidth: 1, borderColor: '#065f46' },
  responseLabel: { fontSize: 11, color: '#6ee7b7', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' },
  responseTextContainer: { maxHeight: 200 },
  responseText: { fontSize: 15, color: '#d1fae5', lineHeight: 22 },
  button: { backgroundColor: '#16a34a', paddingVertical: 16, paddingHorizontal: 40, borderRadius: 50, marginBottom: 12 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  stopButton: { backgroundColor: '#991b1b', paddingVertical: 14, paddingHorizontal: 40, borderRadius: 50, marginBottom: 20, borderWidth: 1, borderColor: '#7f1d1d', width: '80%', alignItems: 'center' },
  stopButtonText: { color: '#fecaca', fontSize: 15, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 },
  voiceButton: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1, borderColor: '#4b5563', marginBottom: 10 },
  voiceButtonText: { color: '#9ca3af', fontSize: 14 },
  hint: { fontSize: 12, color: '#4b5563', textAlign: 'center' },
  errorText: { color: '#ef4444', marginBottom: 10 },
});

registerRootComponent(App);
