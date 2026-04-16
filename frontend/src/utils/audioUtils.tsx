// @ts-nocheck
import { Audio } from 'expo-av';

export const startDucking = async (silentSoundRef) => {
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
      await silentSoundRef.current.setVolumeAsync(0.9);
      await silentSoundRef.current.playAsync();
    } catch (err) { /* silent fail */ }
  }
};

export const stopDucking = async (silentSoundRef) => {
  console.log('[Audio] Stopping ducking focus...');
  if (silentSoundRef.current) {
    try {
      await silentSoundRef.current.stopAsync();
      await silentSoundRef.current.setVolumeAsync(0);
    } catch (err) { /* silent fail */ }
  }
  try {
    const setMode = async (mode) => {
      await Promise.race([
        Audio.setAudioModeAsync(mode),
        new Promise(resolve => setTimeout(resolve, 500))
      ]);
    };

    await setMode({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: false,
      staysActiveInBackground: true,
      interruptionModeIOS: 1, // MixWithOthers
      interruptionModeAndroid: 1, // DoNotMix
    });

    await new Promise(resolve => setTimeout(resolve, 200));

    await setMode({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: false,
      staysActiveInBackground: true,
      interruptionModeIOS: 2,
      interruptionModeAndroid: 2,
    });
    console.log('[Audio] Ducking released and volume restoration triggered.');
  } catch (err) { console.log('[Audio] Stop ducking failed:', err.message); }
};

/**
 * @param {object} options
 * @param {Function|null} options.stopRecognition  - optional async fn to stop native speech
 */
export const cleanupAudio = async (recordingRef, setRecording, options = {}) => {
  console.log('[Cleanup] Starting cleanup flow...');
  try {
    if (options.stopRecognition) {
      await Promise.race([
        options.stopRecognition(),
        new Promise(resolve => setTimeout(resolve, 300))
      ]).catch(() => { });
    }

    if (recordingRef.current) {
      console.log('[Cleanup] Found stuck recording. Unloading...');
      const rec = recordingRef.current;
      recordingRef.current = null;
      if (setRecording) setRecording(null);
      try {
        const status = await Promise.race([
          rec.getStatusAsync(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Status timeout')), 300))
        ]).catch(e => ({ isRecording: true, isPrepared: true }));

        if (status.isRecording || status.isPrepared) {
          console.log('[Cleanup] Stop/Unload call...');
          await Promise.race([
            rec.stopAndUnloadAsync(),
            new Promise(resolve => setTimeout(resolve, 800))
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
