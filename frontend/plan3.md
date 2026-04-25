# Bug Analysis: Background Listener Overpowering Frontend

The user reports that after opening the app from the background, the background Vosk service is still actively listening and intercepting audio ("Hey Bovi" triggers the overlay, while "Hey Bessie" is ignored). 

## Root Causes
1. **Missing Kotlin Recompilation**: In the previous step, new `@ReactMethod` functions (`pauseVosk`, `resumeVosk`) were added to the Android Native Module (`WakeWordModule.kt`). However, if the user is running an Expo development client or testing via a Metro reload without completely rebuilding the Android app (`./gradlew assembleDebug`), these new native methods are `undefined` on the JavaScript side.
2. **Graceful Fallback Missing**: Because `WakeWord.pauseVosk` is undefined, the `if (WakeWord.pauseVosk) { ... }` block in `App.tsx` silently skips execution. Consequently, the native Vosk service is never told to pause, and it continues holding the microphone.
3. **Headless Task Interference**: The background `HeadlessVoiceTask` explicitly calls `resumeVosk` when it finishes. If this task happens to complete *after* the user has brought the app to the foreground, it will turn the background listener back on.

## Proposed Solution
Instead of relying strictly on `pauseVosk` and `resumeVosk` (which might require an Android rebuild and complex state management), we can achieve the same AppState lifecycle separation using the pre-existing, fully-compiled `stopListening` and `startListening` methods in `WakeWordModule`.

1. **Modify `App.tsx` AppState Handler**:
   - **Foreground**: Call `WakeWord.stopListening()` to definitively tear down the Vosk service and release the microphone. Then start the frontend `expo-speech-recognition` listener.
   - **Background**: Stop the frontend listener, and call `WakeWord.startListening()` to spin the Vosk service back up for background detection.
2. **Modify `HeadlessVoiceTask.ts`**:
   - Ensure it only restarts the background listener (`startListening`) if the app is still in the background, to prevent it from stealing the mic if the user has since opened the app.
3. **Modify `SettingsSection.tsx`**:
   - Remove the `pauseVosk` logic, as `stopListening`/`startListening` handles the lifecycle completely.

This approach guarantees the microphone is released without needing any custom native recompilation.
