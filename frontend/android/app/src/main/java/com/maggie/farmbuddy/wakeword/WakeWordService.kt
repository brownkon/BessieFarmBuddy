package com.maggie.farmbuddy.wakeword

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.IBinder
import android.os.Bundle
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.ReactApplication
import com.facebook.react.modules.core.DeviceEventManagerModule
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.*

class WakeWordService : Service(), RecognitionListener {

    private var speechRecognizer: SpeechRecognizer? = null
    private var recognizerIntent: Intent? = null
    private val TAG = "WakeWordService"
    private val CHANNEL_ID = "WakeWordServiceChannel"
    private val WAKE_WORDS = listOf("hey bovi", "ok bovi", "okay bovi", "hey bovey", "okay bovey" , "ok bovey", "okay bovay", "hey bovay", "hey bessie", "ok bessie")
    private val WAKE_WORD_DISPLAY = "Hey Bessie / Ok Bessie"
    private var wakeToneGenerator: ToneGenerator? = null
    private val handler = Handler(Looper.getMainLooper())
    private var isListening = false

    private fun hasLocationPermission(): Boolean {
        val hasFine = ContextCompat.checkSelfPermission(
            this,
            android.Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        val hasCoarse = ContextCompat.checkSelfPermission(
            this,
            android.Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        return hasFine || hasCoarse
    }

    private fun hasAudioPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            android.Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
    }

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service Created")

        if (!isWakeWordEnabled(this)) {
            Log.d(TAG, "Wake word is disabled. Ignoring service start request.")
            stopSelf()
            return
        }

        if (!hasAudioPermission()) {
            Log.w(TAG, "RECORD_AUDIO permission missing; stopping wake word service start.")
            setWakeWordEnabled(this, false)
            stopSelf()
            return
        }

        isServiceRunning = true
        isRecognitionPaused = false
        createNotificationChannel()
        wakeToneGenerator = try {
            ToneGenerator(AudioManager.STREAM_MUSIC, 100)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to initialize wake tone generator: ${e.message}")
            null
        }
        
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val foregroundTypes = if (hasLocationPermission()) {
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
                } else {
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                }
                startForeground(1, buildNotification("Initializing Voice Assistant..."), foregroundTypes)
            } else {
                startForeground(1, buildNotification("Initializing Voice Assistant..."))
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "Failed to start foreground service with requested types", e)
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(
                        1,
                        buildNotification("Initializing Voice Assistant..."),
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                    )
                } else {
                    startForeground(1, buildNotification("Initializing Voice Assistant..."))
                }
            } catch (inner: SecurityException) {
                Log.e(TAG, "Failed to start foreground service in fallback mode", inner)
                setWakeWordEnabled(this, false)
                stopSelf()
                return
            }
        }
        
        handler.post { initSpeechRecognizer() }
    }

    private fun initSpeechRecognizer() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            Log.e(TAG, "SpeechRecognizer is not available on this device.")
            updateNotification("No Speech Recognition available")
            setWakeWordEnabled(this, false)
            isServiceRunning = false
            stopSelf()
            return
        }

        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this)
        speechRecognizer?.setRecognitionListener(this)

        recognizerIntent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_WEB_SEARCH)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            // It's recommended to try fetching offline if needed or keep default
        }

        startRecognition()
    }

    private fun startRecognition() {
        if (speechRecognizer == null || isProcessingWakeWord || isRecognitionPaused) return
        try {
            speechRecognizer?.startListening(recognizerIntent)
            isListening = true
            updateNotification("Listening for '$WAKE_WORD_DISPLAY'")
        } catch (e: Exception) {
            Log.e(TAG, "Error starting recognition " + e.message)
            restartListeningDelayed()
        }
    }

    private fun stopRecognition() {
        isListening = false
        try {
            speechRecognizer?.stopListening()
        } catch (e: Exception) {}
    }

    private fun restartListeningDelayed() {
        if (!isServiceRunning || isProcessingWakeWord || isRecognitionPaused) return
        handler.postDelayed({
            if (isServiceRunning && !isListening && !isProcessingWakeWord && !isRecognitionPaused) {
                startRecognition()
            }
        }, 300)
    }

    companion object {
        const val ACTION_STOP_SERVICE = "ACTION_STOP_SERVICE"
        const val ACTION_RESUME_VOSK = "ACTION_RESUME_VOSK"
        const val ACTION_PAUSE_LISTENING = "ACTION_PAUSE_LISTENING"
        const val ACTION_UPDATE_NOTIFICATION = "ACTION_UPDATE_NOTIFICATION"
        private const val PREFS_NAME = "wake_word_prefs"
        private const val KEY_WAKEWORD_ENABLED = "wakeword_enabled"

        @Volatile
        var isServiceRunning: Boolean = false
        
        @Volatile
        var isProcessingWakeWord: Boolean = false

        @Volatile
        var isVoiceTabActiveInForeground: Boolean = false

        @Volatile
        var isRecognitionPaused: Boolean = false

        fun isWakeWordEnabled(context: Context): Boolean {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            return prefs.getBoolean(KEY_WAKEWORD_ENABLED, false)
        }

        fun setWakeWordEnabled(context: Context, enabled: Boolean) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putBoolean(KEY_WAKEWORD_ENABLED, enabled).apply()
        }

        fun setForegroundVoiceTabActive(active: Boolean) {
            isVoiceTabActiveInForeground = active
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "Service Started / Command Received")
        if (intent?.action == ACTION_STOP_SERVICE) {
            Log.d(TAG, "Stop Action Received. Stopping service.")
            setWakeWordEnabled(this, false)
            stopForeground(true)
            stopSelf()
            return START_NOT_STICKY
        } else if (intent?.action == ACTION_RESUME_VOSK) {
            Log.d(TAG, "Resume Action Received.")
            isRecognitionPaused = false
            if (!isListening) {
                handler.post { startRecognition() }
            }
        } else if (intent?.action == ACTION_PAUSE_LISTENING) {
            Log.d(TAG, "Pause Action Received.")
            isRecognitionPaused = true
            stopRecognition()
            updateNotification("Assistant in use...")
        } else if (intent?.action == ACTION_UPDATE_NOTIFICATION) {
            val text = intent.getStringExtra("text")
            if (text != null) {
                updateNotification(text)
            }
        }
        
        if (isListening && intent?.action != ACTION_UPDATE_NOTIFICATION) {
            updateNotification("Listening for '$WAKE_WORD_DISPLAY'")
        }
        return START_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        Log.d(TAG, "App task removed, but keeping foreground service alive")
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "Service Destroyed")
        isServiceRunning = false
        isRecognitionPaused = false
        handler.removeCallbacksAndMessages(null)
        try {
            speechRecognizer?.destroy()
        } catch (_: Exception) {}
        speechRecognizer = null
        try {
            wakeToneGenerator?.release()
        } catch (_: Exception) {}
        wakeToneGenerator = null
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null // We don't provide binding, just start/stop
    }

    // RecognitionListener Methods
    override fun onReadyForSpeech(params: Bundle?) {
        Log.d(TAG, "Ready for speech")
    }

    override fun onBeginningOfSpeech() {
    }

    override fun onRmsChanged(rmsdB: Float) {
    }

    override fun onBufferReceived(buffer: ByteArray?) {
    }

    override fun onEndOfSpeech() {
        Log.d(TAG, "End of speech")
        isListening = false
    }

    override fun onError(error: Int) {
        Log.e(TAG, "Speech Recognizer Error: $error")
        isListening = false
        // Error codes: SpeechRecognizer.ERROR_NO_MATCH (7), ERROR_SPEECH_TIMEOUT (6)
        // Only restart if not matching wake word
        restartListeningDelayed()
    }

    override fun onResults(results: Bundle?) {
        isListening = false
        val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        Log.d(TAG, "onResults: $matches")
        if (!matches.isNullOrEmpty()) {
            processHypothesis(matches[0])
        }
        restartListeningDelayed()
    }

    override fun onPartialResults(partialResults: Bundle?) {
        val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        if (!matches.isNullOrEmpty()) {
            processHypothesis(matches[0])
        }
    }

    override fun onEvent(eventType: Int, params: Bundle?) {
    }

    private fun playWakeTone() {
        try {
            val tone = wakeToneGenerator ?: ToneGenerator(AudioManager.STREAM_MUSIC, 100)
            tone.startTone(ToneGenerator.TONE_PROP_BEEP2, 220)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to play native wake tone: ${e.message}")
        }
    }

    private fun processHypothesis(hypothesis: String?) {
        if (hypothesis != null) {
            val spokenText = hypothesis
            val normalizedSpokenText = spokenText
                .lowercase()
                .replace(Regex("[^a-z\\s]"), " ")
                .replace(Regex("\\s+"), " ")
                .trim()
            val lowerHypo = hypothesis.lowercase()

            val hasDirectWakePhrase = WAKE_WORDS.any { normalizedSpokenText.contains(it) }
            val hasFallbackWakeSignal =
                (normalizedSpokenText.contains("bovi") || lowerHypo.contains("bovi")) &&
                (normalizedSpokenText.contains("hey") ||
                    normalizedSpokenText.contains("ok") ||
                    normalizedSpokenText.contains("okay") ||
                    lowerHypo.contains("hey") ||
                    lowerHypo.contains("ok") ||
                    lowerHypo.contains("okay")) ||
                (normalizedSpokenText.contains("bessie") || lowerHypo.contains("bessie")) &&
                (normalizedSpokenText.contains("hey") ||
                    normalizedSpokenText.contains("ok") ||
                    normalizedSpokenText.contains("okay") ||
                    lowerHypo.contains("hey") ||
                    lowerHypo.contains("ok") ||
                    lowerHypo.contains("okay"))

            if (hasDirectWakePhrase || hasFallbackWakeSignal) {
                if (isProcessingWakeWord) {
                    return
                }
                
                isProcessingWakeWord = true
                isRecognitionPaused = true
                handler.postDelayed({
                    isProcessingWakeWord = false
                }, 5000)

                Log.d(TAG, "WAKE WORD DETECTED!")
                updateNotification("Processing Wake Word...")
                playWakeTone()
                
                try {
                    stopRecognition()
                    Log.d(TAG, "Native microphone released successfully.")
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to release mic: ${e.message}")
                }

                val reactContext = WakeWordModule.reactContextInstance
                val isForeground = reactContext?.lifecycleState == com.facebook.react.common.LifecycleState.RESUMED
                val shouldDelegateToVoiceTab = isForeground && isVoiceTabActiveInForeground
                val wakeEventPayload = Arguments.createMap().apply {
                    putBoolean("nativeWakeTonePlayed", true)
                }

                if (shouldDelegateToVoiceTab) {
                    Log.d(TAG, "App is in FOREGROUND, delegating to React Native UI!")
                    sendEventToReactNative("onWakeWordDetected", wakeEventPayload)
                } else {
                    Log.d(TAG, "Voice tab not active, launching overlay/headless wake flow")
                    if (android.provider.Settings.canDrawOverlays(this)) {
                        VoiceOverlayController.showOverlay(this, "Listening...")
                    } else {
                        Log.w(TAG, "Overlay permission missing; cannot show assistant overlay")
                        updateNotification("Overlay hidden (grant Display over other apps)")
                    }
                    try {
                        val serviceIntent = Intent(this, VoiceHeadlessJsTaskService::class.java).apply {
                            putExtra("wakeWord", spokenText.ifEmpty { "hey bovi" })
                            putExtra("nativeWakeTonePlayed", true)
                        }
                        
                        com.facebook.react.HeadlessJsTaskService.acquireWakeLockNow(this)
                        startService(serviceIntent)
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to launch Headless Task: ${e.message}")
                    }
                }
            }
        }
    }

    private fun sendEventToReactNative(eventName: String, params: Any?) {
        try {
            val reactContext = WakeWordModule.reactContextInstance
            
            if (reactContext != null && reactContext.hasActiveReactInstance()) {
                Log.d(TAG, "ReactContext is valid. Emitting event $eventName")
                reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    ?.emit(eventName, params)
            } else {
                val reactApplication = application as? ReactApplication
                val reactInstanceManager = reactApplication?.reactNativeHost?.reactInstanceManager
                
                reactInstanceManager?.addReactInstanceEventListener(object : com.facebook.react.ReactInstanceEventListener {
                    override fun onReactContextInitialized(context: com.facebook.react.bridge.ReactContext) {
                        context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                            ?.emit(eventName, params)
                        reactInstanceManager.removeReactInstanceEventListener(this)
                    }
                })
            }
        } catch (e: Exception) {
            Log.e(TAG, "Exception while sending event to React Native: ${e.message}", e)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val serviceChannel = NotificationChannel(
                CHANNEL_ID,
                "Voice Assistant Service",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(serviceChannel)
        }
    }

    private fun buildNotification(text: String): android.app.Notification {
        val intent = Intent(this, com.maggie.farmbuddy.MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val pendingIntent = android.app.PendingIntent.getActivity(
            this, 0, intent, android.app.PendingIntent.FLAG_IMMUTABLE
        )

        val stopIntent = Intent(this, WakeWordService::class.java).apply {
            action = ACTION_STOP_SERVICE
        }
        val stopPendingIntent = android.app.PendingIntent.getService(
            this, 1, stopIntent, android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Dairy Voice Assistant")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_dialog_info) 
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop Listening", stopPendingIntent)
            .build()
    }

    private fun updateNotification(text: String) {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(1, buildNotification(text))
    }
}
