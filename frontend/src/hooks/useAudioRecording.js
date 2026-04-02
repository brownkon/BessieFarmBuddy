import { useState, useRef, useEffect } from 'react';
import { Audio } from 'expo-av';
import { cleanupAudio } from '../utils/audioUtils';

export const useAudioRecording = (onSilence, onVolumeChange) => {
  const [recording, setRecording] = useState(null);
  const [volume, setVolume] = useState(0);
  const recordingRef = useRef(null);
  const silenceTimerRef = useRef(null);
  
  // Use refs to avoid stale closures in the recording listener
  const onSilenceRef = useRef(onSilence);
  const onVolumeChangeRef = useRef(onVolumeChange);

  // Keep refs in sync with the latest callbacks
  useEffect(() => {
    onSilenceRef.current = onSilence;
    onVolumeChangeRef.current = onVolumeChange;
  }, [onSilence, onVolumeChange]);

  const startRecording = async () => {
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

          if (s.durationMillis > 1500) {
            if (s.metering > -30) {
              clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
            } else if (s.metering < -42) {
              if (!silenceTimerRef.current) {
                silenceTimerRef.current = setTimeout(() => {
                  console.log('[Audio] Silence Timed Out (Fast Stop).');
                  if (onSilenceRef.current) onSilenceRef.current();
                }, 1000);
              }
            }
          }
        }
      });

      setRecording(newRecording);
      recordingRef.current = newRecording;
      await newRecording.startAsync();
      console.log('[Audio] Recording started.');

    } catch (err) {
      console.warn('[Audio] Failed to record:', err);
      throw err;
    }
  };

  const stopAndGetURI = async () => {
    clearTimeout(silenceTimerRef.current);
    try {
      const rec = recordingRef.current;
      if (!rec) return null;
      console.log('[Audio] Stopping for Whisper...');
      await cleanupAudio(recordingRef, setRecording, { stopVosk: true });
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
    stopAndGetURI,
    recordingRef,
  };
};
