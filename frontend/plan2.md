# Bug Analysis: Background Listener Conflict

The user reports that the background listener remains active and triggers "Hey Bovi" even when the app is in the foreground, preventing the frontend's listener ("Hey Bessie") from taking over. Furthermore, turning off the background listener in settings leaves the audio broken.

## Root Causes
1. **Background Service Remains Active**: When `isVoiceTabActiveInForeground` is true, the native `WakeWordService` stays running and continues listening via Vosk. It simply delegates the *result* to React Native. Because it holds the microphone and listens for its own wake word ("Hey Bovi"), the frontend's `expo-speech-recognition` is never started (the code actively prevents it from starting if `backgroundWakeRunning` is true).
2. **Audio Resources Blocked**: Even if the frontend tried to listen, the native Vosk service holding the microphone would block `expo-speech-recognition` from reliably gaining audio focus, leading to conflicts.
3. **Settings Toggle Desync**: When turning off the background listener in settings, the notification disappears (the service stops), but if the frontend listener wasn't immediately started in its place, the app is left with *neither* listener running, leading to the perception of "broken audio" (it's actually just not listening).

## Proposed Solution
We need a robust App State lifecycle management strategy that strictly separates the foreground and background listeners:
1. **Add `pauseVosk` to Native Code**: Expose a `pauseVosk` method in `WakeWordModule.kt` and `WakeWordService.kt`. This will call `speechService?.stop()` to cleanly release the microphone without destroying the whole background service or unloading the Vosk model.
2. **Strict Lifecycle Handlers in `App.tsx`**:
    - **When App Opens (Foreground)**: Call `WakeWord.pauseVosk()`. Start the frontend's native `expo-speech-recognition` listener so it listens for "Hey Bessie" and uses the standard frontend workflow.
    - **When App Closes (Background)**: Stop the frontend listener. Call `WakeWord.resumeVosk()` so the background service grabs the microphone again.
3. **Fix Settings Toggle**: Ensure that toggling the background listener in the Settings tab immediately manages the `App.tsx` listener state properly, so turning off the background listener doesn't leave the app totally deaf.
