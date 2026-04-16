package com.voidedflyer.dairyvoiceapp.wakeword

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
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.ReactApplication
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.RecognitionListener
import org.vosk.android.SpeechService
import org.vosk.android.StorageService
import java.io.IOException

class WakeWordService : Service(), RecognitionListener {

    private var model: Model? = null
    private var speechService: SpeechService? = null
    private val TAG = "WakeWordService"
    private val CHANNEL_ID = "WakeWordServiceChannel"
    private val WAKE_WORDS = listOf("hey bovi", "ok bovi", "okay bovi", "hey bovey", "okay bovey" , "ok bovey", "okay bovay", "hey bovay")
    private val WAKE_WORD_DISPLAY = "Hey Bovi / Ok Bovi"
    private var wakeToneGenerator: ToneGenerator? = null

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
        
        initModel()
    }

    private fun initModel() {
        try {
            val fileList = this.assets.list("model")
            if (fileList.isNullOrEmpty()) {
                Log.e(TAG, "Assets 'model' folder is EMPTY or null!")
                updateNotification("Err: model missing from APK. Clean build needed.")
                setWakeWordEnabled(this, false)
                isServiceRunning = false
                stopSelf()
                return
            }
            Log.d(TAG, "Found ${fileList.size} items in assets/model")

            if (!fileList.contains("uuid")) {
                Log.e(TAG, "assets/model/uuid is missing; cannot unpack Vosk model")
                updateNotification("Err: model missing uuid file")
                setWakeWordEnabled(this, false)
                isServiceRunning = false
                stopSelf()
                return
            }
        } catch (e: Exception) {
            updateNotification("Err finding assets: ${e.message}")
            setWakeWordEnabled(this, false)
            isServiceRunning = false
            stopSelf()
            return
        }

        StorageService.unpack(this, "model", "model-en-us", // Use new targeted cache name to bypass corrupted cache!
            { model ->
                this.model = model
                startRecognition()
            },
            { exception ->
                val emsg = exception.message ?: exception.toString()
                Log.e(TAG, "Failed to unpack the model. Reason: $emsg")
                updateNotification("Load Err: $emsg") // This will show EXACTLY why it crashes!
                setWakeWordEnabled(this, false)
                isServiceRunning = false
                stopSelf() // Stop the service appropriately so it frees up everything
            })
    }

    private fun startRecognition() {
        if (model == null) return
        try {
            // Include unknown words bracket so it doesn't force gibberish into "hey" or "dairy"
            val rec = Recognizer(model!!, 16000.0f)
            speechService = SpeechService(rec, 16000.0f)
            speechService?.startListening(this)
            updateNotification("Listening for '$WAKE_WORD_DISPLAY'")
        } catch (e: IOException) {
            Log.e(TAG, "Error starting recognition " + e.message)
        }
    }

    companion object {
        const val ACTION_STOP_SERVICE = "ACTION_STOP_SERVICE"
        const val ACTION_RESUME_VOSK = "ACTION_RESUME_VOSK"
        const val ACTION_UPDATE_NOTIFICATION = "ACTION_UPDATE_NOTIFICATION"
        private const val PREFS_NAME = "wake_word_prefs"
        private const val KEY_WAKEWORD_ENABLED = "wakeword_enabled"

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

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "Service Started / Command Received")
        if (intent?.action == ACTION_STOP_SERVICE) {
            Log.d(TAG, "Stop Action Received. Stopping service.")
            setWakeWordEnabled(this, false)
            stopForeground(true)
            stopSelf()
            return START_NOT_STICKY
        } else if (intent?.action == ACTION_RESUME_VOSK) {
            Log.d(TAG, "Resume Vosk Action Received.")
            if (speechService == null && model != null) {
                startRecognition()
            }
        } else if (intent?.action == ACTION_UPDATE_NOTIFICATION) {
            val text = intent.getStringExtra("text")
            if (text != null) {
                updateNotification(text)
            }
        }
        
        // If start command given again and speech service exists, ensure it's listening
        if (speechService != null && intent?.action != ACTION_UPDATE_NOTIFICATION) {
            updateNotification("Listening for '$WAKE_WORD_DISPLAY'")
        }
        // Use START_STICKY so it doesn't automatically restart if the system kills it,
        // Wait, the user wants the notification to stay on when app is closed like Spotify.
        // START_STICKY will restart it if system kills it. Let's use START_STICKY.
        return START_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        Log.d(TAG, "App task removed, but keeping foreground service alive")
        // Stop calling stopSelf() here so it stays alive when swiped away
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "Service Destroyed")
        isServiceRunning = false
        speechService?.stop()
        speechService?.shutdown()
        model?.close()
        try {
            wakeToneGenerator?.release()
        } catch (_: Exception) {
        }
        wakeToneGenerator = null
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null // We don't provide binding, just start/stop
    }

    // RecognitionListener Methods
    override fun onResult(hypothesis: String?) {
        Log.d(TAG, "onResult: $hypothesis")
        processHypothesis(hypothesis)
    }

    override fun onPartialResult(hypothesis: String?) {
        // We evaluate partial results quickly so it registers instantly
        processHypothesis(hypothesis)
    }

    override fun onFinalResult(hypothesis: String?) {
        Log.d(TAG, "onFinalResult: $hypothesis")
        processHypothesis(hypothesis)
    }

    override fun onError(e: Exception?) {
        Log.e(TAG, "Vosk Error: ${e?.message}")
    }

    override fun onTimeout() {
        Log.d(TAG, "Vosk Timeout")
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
            // Log out what Vosk is actually recognizing to help us debug
            Log.d(TAG, "Checking hypothesis for wake word: $hypothesis")
            
            // Let's extract the text and show it in the notification so you can see what it hears
            val match = Regex("\"(?:partial|text)\"\\s*:\\s*\"([^\"]*)\"").find(hypothesis)
            val spokenText = match?.groupValues?.get(1) ?: ""
            
            if (spokenText.isNotEmpty()) {
                updateNotification("Hearing: '$spokenText'")
            }

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
                    lowerHypo.contains("okay"))

            // Allow explicit phrase match plus a fallback split-word match for partial hypotheses.
            if (hasDirectWakePhrase || hasFallbackWakeSignal) {
                if (isProcessingWakeWord) {
                    return
                }
                
                isProcessingWakeWord = true
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    isProcessingWakeWord = false
                }, 5000)

                Log.d(TAG, "WAKE WORD DETECTED!")
                updateNotification("Processing Wake Word...")
                playWakeTone()
                
                // Immediately stop Vosk from holding the microphone so Expo can take over!
                try {
                    speechService?.stop()
                    speechService = null
                    Log.d(TAG, "Vosk microphone released successfully.")
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
                Log.e(TAG, "ReactContext is NULL or not active! We brought the app to foreground, so it should initialize shortly.")
                
                // Fallback: try to add a listener if the instance manager exists
                val reactApplication = application as? ReactApplication
                val reactInstanceManager = reactApplication?.reactNativeHost?.reactInstanceManager
                
                reactInstanceManager?.addReactInstanceEventListener(object : com.facebook.react.ReactInstanceEventListener {
                    override fun onReactContextInitialized(context: com.facebook.react.bridge.ReactContext) {
                        Log.d(TAG, "ReactContext became available! Emitting $eventName now.")
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
        val intent = Intent(this, com.voidedflyer.dairyvoiceapp.MainActivity::class.java).apply {
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
