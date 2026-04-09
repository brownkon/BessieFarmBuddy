import { useState, useRef, useEffect } from 'react';
import { Audio } from 'expo-av';
import { cleanupAudio } from '../utils/audioUtils';

export const useAudioRecording = (onSilence, onVolumeChange) => {
  const [recording, setRecording] = useState(null);
  const [volume, setVolume] = useState(0);
  const recordingRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const startTimeRef = useRef(0);

  // Use refs to avoid stale closures in the recording listener
  const onSilenceRef = useRef(onSilence);
  const onVolumeChangeRef = useRef(onVolumeChange);

  // Keep refs in sync with the latest callbacks
  useEffect(() => {
    onSilenceRef.current = onSilence;
    onVolumeChangeRef.current = onVolumeChange;
  }, [onSilence, onVolumeChange]);

  const isPreparingRef = useRef(false);
  const startRecording = async () => {
    if (isPreparingRef.current) {
      console.log('[Audio] Already preparing a recording. Skipping.');
      return;
    }
    isPreparingRef.current = true;
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') throw new Error('Microphone permission not granted');

      await cleanupAudio(recordingRef, setRecording, { stopVosk: false });

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
          const norm = Math.max(0, (s.metering + 80) / 80);
          setVolume(norm);
          if (onVolumeChangeRef.current) onVolumeChangeRef.current(norm);

          // DEBUG: Log metering occasionally
          if (Math.random() < 0.05) console.log(`[Audio-DEBUG] Metering: ${s.metering.toFixed(1)} dB`);

          if (s.durationMillis > 1500) {
            if (s.metering > -30) {
              if (silenceTimerRef.current) {
                console.log('[Audio] Sound detected, clearing silence timer.');
                clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = null;
              }
            } else if (s.metering < -40) { // Slightly more lenient than -42
              if (!silenceTimerRef.current) {
                console.log('[Audio] Silence detected, starting timer...');
                silenceTimerRef.current = setTimeout(() => {
                  console.log('[Audio] Silence Safety Timeout (Fallback).');
                  if (onSilenceRef.current) onSilenceRef.current();
                }, 5000);
              }
            }
          }
        }
      });

      setRecording(newRecording);
      recordingRef.current = newRecording;
      await newRecording.startAsync();
      startTimeRef.current = Date.now();
      console.log('[Audio] Recording started.');

      // 15 Second Safety Backup (increased from 10)
      setTimeout(() => {
        if (recordingRef.current) {
          console.log('[Audio] Safety Timeout reached. Forcing stop.');
          if (onSilenceRef.current) onSilenceRef.current();
        }
      }, 15000);

    } catch (err) {
      console.warn('[Audio] Failed to record:', err);
      throw err;
    } finally {
      isPreparingRef.current = false;
    }
  };

  const stopRecordingManual = async () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    try {
      await cleanupAudio(recordingRef, setRecording, { stopVosk: false });
      setVolume(0);
    } catch (err) {
      console.warn('[Audio] Failed to stop manually:', err);
    }
  };

  const resetSilenceTimer = () => {
    if (silenceTimerRef.current) {
      console.log('[Audio] VAD Reset: Clearing silence timer.');
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const stopAndGetURI = async () => {
    clearTimeout(silenceTimerRef.current);
    try {
      const rec = recordingRef.current;
      if (!rec) return null;
      console.log('[Audio] Stopping for Whisper...');
      await cleanupAudio(recordingRef, setRecording, { stopVosk: true });
      const duration = (Date.now() - startTimeRef.current) / 1000;
      console.log(`[Audio] Recording stopped. Duration: ${duration.toFixed(2)}s`);
      const uri = rec.getURI();
      setVolume(0);
      return uri;
    } catch (err) {
      console.warn('[Audio] Failed to stop:', err);
      return null;
    }
  };

  return {
    recording,
    volume,
    setVolume,
    startRecording,
    stopRecordingManual,
    stopAndGetURI,
    resetSilenceTimer,
    recordingRef,
  };
};
