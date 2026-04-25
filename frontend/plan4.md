# Bug Analysis: Background Listener Stuck and Toggle Reset

The user reports two issues: 
1. The background listener toggle resets to "OFF" every time the app opens.
2. When the app is closed, the notification gets stuck on "Initializing..." and Vosk never actually starts.

## Root Causes
1. **Toggle Reset Issue**: In `WakeWordService.kt`, when the service receives `ACTION_STOP_SERVICE`, it explicitly calls `setWakeWordEnabled(this, false)`. Since `App.tsx` now uses `WakeWord.stopListening()` (which sends `ACTION_STOP_SERVICE`) to cleanly release the microphone when the app opens, it inadvertently destroys the user's saved preference!
2. **Stuck Initializing Issue**: In `App.tsx`, `WakeWord.setForegroundVoiceTabActive(isForeground)` is called as an asynchronous bridge function without being `await`ed. When the app goes to the background, `WakeWord.startListening()` spins up the service *before* the native side realizes the app has gone to the background. Consequently, the native code sees `isVoiceTabActiveInForeground = true`, skips starting Vosk (due to our safeguard), and the notification gets permanently stuck on "Initializing...".

## Proposed Solution
We need a targeted set of fixes to correct these two lifecycle race conditions:

1. **Remove Hardcoded Preference Reset**: In `WakeWordService.kt`, remove the `setWakeWordEnabled(this, false)` line from the `ACTION_STOP_SERVICE` handler. The setting should ONLY be modified by the user toggling it in the settings menu, not by the lifecycle stop command.
2. **Await Native State Updates**: In `App.tsx`, `await WakeWord.setForegroundVoiceTabActive(isForeground)` *before* proceeding with the rest of the AppState logic. This guarantees the native Kotlin code knows the app is in the background *before* `startListening()` is called.
3. **Handle Late Restarts**: In `WakeWordService.kt`, if `setForegroundVoiceTabActive(false)` is called *after* the service is already running, it should explicitly check if it needs to call `startRecognition()` to ensure Vosk actually spins up if it was previously skipped.
