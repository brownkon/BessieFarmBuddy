package com.maggie.farmbuddy.wakeword

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.common.LifecycleState
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.Locale
import kotlin.math.min

class WakeWordService : Service(), RecognitionListener {

    private var speechRecognizer: SpeechRecognizer? = null
    private var wakeToneGenerator: ToneGenerator? = null
    private val restartHandler = Handler(Looper.getMainLooper())
    private val pauseGuardHandler = Handler(Looper.getMainLooper())
    private var restartDelayMs = BASE_RESTART_DELAY_MS
    private var waitingForResume = false
    private var lastHeardSnippet = ""
    private var lastHeardNotificationAtMs = 0L

    override fun onCreate() {
        super.onCreate()

        // Reset foreground tab marker for new service lifecycle; app JS will re-assert if needed.
        isVoiceTabActiveInForeground = false

        if (!isWakeWordEnabled(this)) {
            Log.d(TAG, "Wake word disabled; stopping service")
            stopSelf()
            return
        }

        if (!hasAudioPermission()) {
            Log.w(TAG, "RECORD_AUDIO permission missing; disabling wake word")
            setWakeWordEnabled(this, false)
            stopSelf()
            return
        }

        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            Log.e(TAG, "SpeechRecognizer is not available on this device")
            setWakeWordEnabled(this, false)
            stopSelf()
            return
        }

        isServiceRunning = true
        createNotificationChannel()
        startForegroundSafely("Initializing Voice Assistant...")

        wakeToneGenerator = try {
            ToneGenerator(AudioManager.STREAM_MUSIC, 100)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to initialize wake tone generator", e)
            null
        }

        initSpeechRecognizer()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP_SERVICE -> {
                setWakeWordEnabled(this, false)
                stopForeground(true)
                stopSelf()
                return START_NOT_STICKY
            }

            ACTION_PAUSE_LISTENING -> {
                pauseListeningInternal()
                return START_STICKY
            }

            ACTION_RESUME_LISTENING,
            ACTION_RESUME_VOSK -> {
                resumeListeningInternal()
                return START_STICKY
            }

            ACTION_UPDATE_NOTIFICATION -> {
                val text = intent.getStringExtra("text")
                if (!text.isNullOrBlank()) {
                    updateNotification(text)
                }
                return START_STICKY
            }
        }

        if (waitingForResume) {
            maybeAutoResumeFromPause("start-command")
        }

        if (waitingForResume) {
            return START_STICKY
        }

        startRecognition()

        return START_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        Log.d(TAG, "App task removed; keeping foreground service alive")
        maybeAutoResumeFromPause("task-removed")
    }

    override fun onDestroy() {
        super.onDestroy()
        isServiceRunning = false
        restartHandler.removeCallbacksAndMessages(null)
        pauseGuardHandler.removeCallbacksAndMessages(null)

        try {
            speechRecognizer?.cancel()
            speechRecognizer?.destroy()
        } catch (_: Exception) {
        }
        speechRecognizer = null

        try {
            wakeToneGenerator?.release()
        } catch (_: Exception) {
        }
        wakeToneGenerator = null
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun hasAudioPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            android.Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
    }

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

    private fun initSpeechRecognizer() {
        try {
            speechRecognizer?.destroy()
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this)
            speechRecognizer?.setRecognitionListener(this)
            restartDelayMs = BASE_RESTART_DELAY_MS
            startRecognition()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize speech recognizer", e)
            scheduleRestart("init-failure")
        }
    }

    private fun buildRecognitionIntent(): Intent {
        return Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.US.toLanguageTag())
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, false)
        }
    }

    private fun startRecognition() {
        if (waitingForResume || !isWakeWordEnabled(this)) {
            return
        }

        if (!hasAudioPermission()) {
            setWakeWordEnabled(this, false)
            stopSelf()
            return
        }

        val recognizer = speechRecognizer ?: run {
            initSpeechRecognizer()
            return
        }

        try {
            recognizer.startListening(buildRecognitionIntent())
            lastHeardSnippet = ""
            updateNotification("Listening for 'Hey Bessie'")
        } catch (e: Exception) {
            Log.e(TAG, "startListening failed", e)
            scheduleRestart("start-failure")
        }
    }

    private fun resumeListeningInternal() {
        waitingForResume = false
        restartDelayMs = BASE_RESTART_DELAY_MS
        restartHandler.removeCallbacksAndMessages(null)
        pauseGuardHandler.removeCallbacksAndMessages(null)

        try {
            speechRecognizer?.cancel()
        } catch (_: Exception) {
        }

        startRecognition()
    }

    private fun pauseListeningInternal() {
        waitingForResume = true
        restartHandler.removeCallbacksAndMessages(null)
        pauseGuardHandler.removeCallbacksAndMessages(null)
        try {
            speechRecognizer?.cancel()
        } catch (_: Exception) {
        }
        updateNotification("Wake listener paused (app in foreground)")
        pauseGuardHandler.postDelayed(
            { maybeAutoResumeFromPause("pause-guard") },
            PAUSE_GUARD_DELAY_MS
        )
    }

    private fun shouldRemainPausedForForegroundVoiceTab(): Boolean {
        val reactContext = WakeWordModule.reactContextInstance
        val isForeground = reactContext?.lifecycleState == LifecycleState.RESUMED
        return isForeground && isVoiceTabActiveInForeground
    }

    private fun maybeAutoResumeFromPause(reason: String) {
        if (!waitingForResume) {
            return
        }

        if (shouldRemainPausedForForegroundVoiceTab()) {
            Log.d(TAG, "Keeping wake listener paused ($reason): app is foreground")
            return
        }

        Log.d(TAG, "Auto-resuming wake listener from paused state ($reason)")
        resumeListeningInternal()
    }

    private fun scheduleRestart(reason: String) {
        if (waitingForResume || !isWakeWordEnabled(this)) {
            return
        }

        Log.d(TAG, "Scheduling recognizer restart: $reason ($restartDelayMs ms)")
        restartHandler.removeCallbacksAndMessages(null)
        restartHandler.postDelayed({ startRecognition() }, restartDelayMs)
        restartDelayMs = min(restartDelayMs * 2, MAX_RESTART_DELAY_MS)
    }

    private fun processSpeechBundle(results: Bundle?) {
        val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) ?: return
        for (raw in matches) {
            processRecognizedText(raw)
        }
    }

    private fun processRecognizedText(rawText: String?) {
        val spokenText = rawText?.trim().orEmpty()
        if (spokenText.isEmpty()) {
            return
        }

        val normalized = spokenText
            .lowercase(Locale.US)
            .replace(Regex("[^a-z\\s]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()

        if (normalized.isEmpty()) {
            return
        }

        val wakeDetected = WAKE_PHRASES.any { normalized.contains(it) }
        if (!wakeDetected) {
            maybeUpdateHeardNotification(spokenText)
            return
        }

        if (isProcessingWakeWord) {
            return
        }

        isProcessingWakeWord = true
        restartHandler.postDelayed({ isProcessingWakeWord = false }, 5000)

        waitingForResume = true
        restartHandler.removeCallbacksAndMessages(null)

        playWakeTone()
        updateNotification("Wake phrase detected: \"${buildHeardSnippet(spokenText)}\"")

        try {
            speechRecognizer?.cancel()
        } catch (_: Exception) {
        }

        val reactContext = WakeWordModule.reactContextInstance
        val isForeground = reactContext?.lifecycleState == LifecycleState.RESUMED
        val shouldDelegateToVoiceTab = isForeground && isVoiceTabActiveInForeground

        val payload = Arguments.createMap().apply {
            putBoolean("nativeWakeTonePlayed", true)
            putString("wakeWord", spokenText)
        }

        if (shouldDelegateToVoiceTab) {
            sendEventToReactNative("onWakeWordDetected", payload)
            return
        }

        if (android.provider.Settings.canDrawOverlays(this)) {
            VoiceOverlayController.showOverlay(this, "Listening...")
        } else {
            updateNotification("Overlay hidden (grant Display over other apps)")
        }

        try {
            val serviceIntent = Intent(this, VoiceHeadlessJsTaskService::class.java).apply {
                putExtra("wakeWord", spokenText)
                putExtra("nativeWakeTonePlayed", true)
            }
            com.facebook.react.HeadlessJsTaskService.acquireWakeLockNow(this)
            startService(serviceIntent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch headless task", e)
            waitingForResume = false
            scheduleRestart("headless-start-failure")
        }
    }

    private fun playWakeTone() {
        try {
            val tone = wakeToneGenerator ?: ToneGenerator(AudioManager.STREAM_MUSIC, 100)
            tone.startTone(ToneGenerator.TONE_PROP_BEEP2, 220)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to play wake tone", e)
        }
    }

    private fun sendEventToReactNative(eventName: String, params: Any?) {
        try {
            val reactContext = WakeWordModule.reactContextInstance
            if (reactContext != null && reactContext.hasActiveReactInstance()) {
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    ?.emit(eventName, params)
                return
            }

            val reactApplication = application as? ReactApplication
            val reactInstanceManager = reactApplication?.reactNativeHost?.reactInstanceManager
            reactInstanceManager?.addReactInstanceEventListener(object : com.facebook.react.ReactInstanceEventListener {
                override fun onReactContextInitialized(context: com.facebook.react.bridge.ReactContext) {
                    context
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        ?.emit(eventName, params)
                    reactInstanceManager.removeReactInstanceEventListener(this)
                }
            })
        } catch (e: Exception) {
            Log.e(TAG, "Failed to emit event to React Native", e)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Voice Assistant Service",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun startForegroundSafely(contentText: String) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val foregroundTypes = if (hasLocationPermission()) {
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
                } else {
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                }
                startForeground(NOTIFICATION_ID, buildNotification(contentText), foregroundTypes)
            } else {
                startForeground(NOTIFICATION_ID, buildNotification(contentText))
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "Failed to start foreground service with requested type", e)
            startForeground(NOTIFICATION_ID, buildNotification(contentText))
        }
    }

    private fun buildNotification(text: String): android.app.Notification {
        val launchIntent = Intent(this, com.maggie.farmbuddy.MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }

        val contentIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val stopIntent = Intent(this, WakeWordService::class.java).apply {
            action = ACTION_STOP_SERVICE
        }

        val stopPendingIntent = PendingIntent.getService(
            this,
            1,
            stopIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Bessie Voice Assistant")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setContentIntent(contentIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop Listening", stopPendingIntent)
            .build()
    }

    private fun updateNotification(text: String) {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, buildNotification(text))
    }

    private fun maybeUpdateHeardNotification(spokenText: String) {
        if (waitingForResume) {
            return
        }

        val snippet = buildHeardSnippet(spokenText)
        if (snippet.isEmpty()) {
            return
        }

        val now = SystemClock.elapsedRealtime()
        if (snippet.equals(lastHeardSnippet, ignoreCase = true) &&
            now - lastHeardNotificationAtMs < DUPLICATE_HEARD_NOTIFICATION_WINDOW_MS
        ) {
            return
        }

        if (now - lastHeardNotificationAtMs < HEARD_NOTIFICATION_MIN_INTERVAL_MS) {
            return
        }

        lastHeardSnippet = snippet
        lastHeardNotificationAtMs = now
        updateNotification("Heard: \"$snippet\"")
    }

    private fun buildHeardSnippet(spokenText: String): String {
        val normalized = spokenText
            .replace(Regex("\\s+"), " ")
            .trim()

        if (normalized.isEmpty()) {
            return ""
        }

        return if (normalized.length <= MAX_HEARD_TEXT_LENGTH) {
            normalized
        } else {
            normalized.substring(0, MAX_HEARD_TEXT_LENGTH - 3).trimEnd() + "..."
        }
    }

    override fun onReadyForSpeech(params: Bundle?) {
        restartDelayMs = BASE_RESTART_DELAY_MS
    }

    override fun onBeginningOfSpeech() = Unit

    override fun onRmsChanged(rmsdB: Float) = Unit

    override fun onBufferReceived(buffer: ByteArray?) = Unit

    override fun onEndOfSpeech() {
        scheduleRestart("end-of-speech")
    }

    override fun onError(error: Int) {
        val label = when (error) {
            SpeechRecognizer.ERROR_AUDIO -> "audio"
            SpeechRecognizer.ERROR_CLIENT -> "client"
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "permission"
            SpeechRecognizer.ERROR_NETWORK -> "network"
            SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "network-timeout"
            SpeechRecognizer.ERROR_NO_MATCH -> "no-match"
            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "busy"
            SpeechRecognizer.ERROR_SERVER -> "server"
            SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "speech-timeout"
            else -> "unknown-$error"
        }

        Log.w(TAG, "Speech recognizer error: $label")
        scheduleRestart("error-$label")
    }

    override fun onResults(results: Bundle?) {
        processSpeechBundle(results)
        if (!waitingForResume) {
            scheduleRestart("results")
        }
    }

    override fun onPartialResults(partialResults: Bundle?) {
        processSpeechBundle(partialResults)
    }

    override fun onEvent(eventType: Int, params: Bundle?) = Unit

    companion object {
        private const val TAG = "WakeWordService"
        private const val CHANNEL_ID = "WakeWordServiceChannel"
        private const val NOTIFICATION_ID = 1
        private const val PREFS_NAME = "wake_word_prefs"
        private const val KEY_WAKEWORD_ENABLED = "wakeword_enabled"
        private const val BASE_RESTART_DELAY_MS = 450L
        private const val MAX_RESTART_DELAY_MS = 5000L
        private const val PAUSE_GUARD_DELAY_MS = 1200L
        private const val MAX_HEARD_TEXT_LENGTH = 64
        private const val HEARD_NOTIFICATION_MIN_INTERVAL_MS = 600L
        private const val DUPLICATE_HEARD_NOTIFICATION_WINDOW_MS = 1600L

        const val ACTION_STOP_SERVICE = "ACTION_STOP_SERVICE"
        const val ACTION_PAUSE_LISTENING = "ACTION_PAUSE_LISTENING"
        const val ACTION_RESUME_LISTENING = "ACTION_RESUME_LISTENING"
        const val ACTION_RESUME_VOSK = "ACTION_RESUME_VOSK"
        const val ACTION_UPDATE_NOTIFICATION = "ACTION_UPDATE_NOTIFICATION"

        private val WAKE_PHRASES = listOf("hey dairy", "hey bessie", "hey bessy")

        @Volatile
        var isServiceRunning: Boolean = false

        @Volatile
        var isProcessingWakeWord: Boolean = false

        @Volatile
        var isVoiceTabActiveInForeground: Boolean = false

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
}
