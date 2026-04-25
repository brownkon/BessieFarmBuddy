package com.maggie.farmbuddy

import android.app.*
import android.content.*
import android.content.pm.ServiceInfo
import android.media.*
import android.os.*
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import androidx.core.app.NotificationCompat
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.*
import java.util.*
import java.util.concurrent.atomic.AtomicBoolean

class VoiceAssistantService : Service(), TextToSpeech.OnInitListener {

    companion object {
        const val TAG = "VoiceAssistantService"
        const val CHANNEL_ID = "bessie_voice_channel"
        const val NOTIFICATION_ID = 1001
        const val ACTION_STOP = "com.maggie.farmbuddy.ACTION_STOP"
        const val ACTION_MUTE = "com.maggie.farmbuddy.ACTION_MUTE"

        val WAKE_PHRASES = listOf("hey dairy", "hey bessie", "hey bessy")

        var backendUrl: String = ""
        var authToken: String = ""
        var sessionId: String? = null
        var language: String = "en"
        var location: String? = null

        // Static instance so the RN module can call methods directly
        var instance: VoiceAssistantService? = null
    }

    enum class AgentState { IDLE, WAKE_WORD_DETECTED, PROCESSING, SPEAKING, ERROR }

    private var currentState = AgentState.IDLE
    private var speechRecognizer: SpeechRecognizer? = null
    private var tts: TextToSpeech? = null
    private var audioManager: AudioManager? = null
    private var isMuted = AtomicBoolean(false)
    private val mainHandler = Handler(Looper.getMainLooper())
    private val httpClient = OkHttpClient()
    private var audioFocusRequest: AudioFocusRequest? = null
    private val speechQueue = mutableListOf<String>()
    private var isSpeakingUtterance = false
    private var ttsReady = false

    private var commandTextToSend: String = ""

    private val actionReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
            when (intent?.action) {
                ACTION_STOP -> { stopSelf() }
                ACTION_MUTE -> {
                    isMuted.set(!isMuted.get())
                    updateNotification()
                    if (isMuted.get()) {
                        cancelCurrentInteraction()
                    }
                }
            }
        }
    }

    // Read token and config from SharedPreferences
    private fun refreshTokenFromPrefs() {
        val prefs = getSharedPreferences("bessie_voice_prefs", 0)
        val storedToken = prefs.getString("authToken", "") ?: ""
        val storedUrl = prefs.getString("backendUrl", "") ?: ""
        val storedLang = prefs.getString("language", "en") ?: "en"
        val storedLoc = prefs.getString("location", "") ?: ""
        
        if (storedToken.isNotEmpty()) {
            authToken = storedToken
            Log.i(TAG, "Token refreshed from prefs, length: ${storedToken.length}")
        }
        if (storedUrl.isNotEmpty()) {
            backendUrl = storedUrl
        }
        language = storedLang
        if (storedLoc.isNotEmpty()) {
            location = storedLoc
        }
    }

    override fun onCreate() {
        super.onCreate()
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        tts = TextToSpeech(this, this)
        createNotificationChannel()
        refreshTokenFromPrefs()
        val filter = IntentFilter().apply {
            addAction(ACTION_STOP)
            addAction(ACTION_MUTE)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(actionReceiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            registerReceiver(actionReceiver, filter)
        }
        instance = this
        Log.i(TAG, "Service created, token length: ${authToken.length}")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = buildNotification("Initializing...")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        intent?.let {
            backendUrl = it.getStringExtra("backendUrl") ?: backendUrl
            authToken = it.getStringExtra("authToken") ?: authToken
            sessionId = it.getStringExtra("sessionId")
        }
        if (ttsReady) {
            transitionTo(AgentState.IDLE)
        }
        return START_STICKY
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            tts?.language = Locale.US
            tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {}
                override fun onDone(utteranceId: String?) {
                    mainHandler.post { onUtteranceDone() }
                }
                override fun onError(utteranceId: String?) {
                    mainHandler.post { onUtteranceDone() }
                }
            })
            ttsReady = true
            Log.i(TAG, "TTS initialized")
            transitionTo(AgentState.IDLE)
        } else {
            Log.e(TAG, "TTS init failed")
        }
    }

    // ── State Machine ──────────────────────────────────────────────

    private fun transitionTo(newState: AgentState) {
        val oldState = currentState
        currentState = newState
        Log.i(TAG, "State: $oldState -> $newState")
        emitStateChanged(newState.name)
        updateNotification()

        when (newState) {
            AgentState.IDLE -> {
                releaseAudioFocus()
                if (!isMuted.get()) {
                    mainHandler.postDelayed({
                        if (currentState == AgentState.IDLE) startWakeWordListening()
                    }, 500)
                }
            }
            AgentState.WAKE_WORD_DETECTED -> {
                requestAudioFocus()
                startCommandListening() // Start speech recognizer for command
            }
            AgentState.PROCESSING -> {
                sendTextToServer()
            }
            AgentState.SPEAKING -> { /* TTS queue handles speaking */ }
            AgentState.ERROR -> {
                mainHandler.postDelayed({ transitionTo(AgentState.IDLE) }, 2000)
            }
        }
    }

    // ── Wake Word (SpeechRecognizer) ───────────────────────────────

    private fun startWakeWordListening() {
        if (isMuted.get()) return
        mainHandler.post {
            try {
                speechRecognizer?.destroy()
                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this)
                speechRecognizer?.setRecognitionListener(wakeWordListener)
                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
                }
                speechRecognizer?.startListening(intent)
                Log.i(TAG, "Wake word listening started")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start wake word listening", e)
                mainHandler.postDelayed({ if (currentState == AgentState.IDLE) startWakeWordListening() }, 2000)
            }
        }
    }

    private fun stopWakeWordListening() {
        mainHandler.post {
            try {
                speechRecognizer?.stopListening()
                speechRecognizer?.destroy()
                speechRecognizer = null
            } catch (e: Exception) {
                Log.w(TAG, "Error stopping speech recognizer", e)
            }
        }
    }

    private val wakeWordListener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}

        override fun onError(error: Int) {
            if (currentState == AgentState.IDLE && !isMuted.get()) {
                mainHandler.postDelayed({ startWakeWordListening() }, 500)
            }
        }

        override fun onResults(results: Bundle?) {
            checkForWakeWord(results)
            if (currentState == AgentState.IDLE && !isMuted.get()) {
                mainHandler.postDelayed({ startWakeWordListening() }, 250)
            }
        }

        override fun onPartialResults(partialResults: Bundle?) {
            checkForWakeWord(partialResults)
        }

        override fun onEvent(eventType: Int, params: Bundle?) {}
    }

    private fun checkForWakeWord(bundle: Bundle?) {
        if (currentState != AgentState.IDLE) return
        val matches = bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) ?: return
        for (match in matches) {
            val lower = match.lowercase().trim()
            for (phrase in WAKE_PHRASES) {
                if (lower.contains(phrase)) {
                    Log.i(TAG, "Wake word detected: $phrase in '$lower'")
                    stopWakeWordListening()
                    transitionTo(AgentState.WAKE_WORD_DETECTED)
                    return
                }
            }
        }
    }

    // ── Manual trigger (from RN) ──────────────────────────────────

    fun manualStartListening() {
        if (currentState != AgentState.IDLE && currentState != AgentState.ERROR) return
        stopWakeWordListening()
        transitionTo(AgentState.WAKE_WORD_DETECTED)
    }

    fun cancelCurrentInteraction() {
        tts?.stop()
        speechQueue.clear()
        isSpeakingUtterance = false
        stopWakeWordListening()
        transitionTo(AgentState.IDLE)
    }

    // ── Command Dictation (SpeechRecognizer) ──────────────────────

    private val commandListener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}

        override fun onError(error: Int) {
            Log.e(TAG, "Command recognizer error: $error")
            // If no match or timeout, just go back to IDLE
            if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                mainHandler.post { transitionTo(AgentState.IDLE) }
            } else {
                mainHandler.post { transitionTo(AgentState.ERROR) }
            }
        }

        override fun onResults(results: Bundle?) {
            val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            val finalText = matches?.firstOrNull() ?: ""
            Log.i(TAG, "Command recognized: $finalText")
            if (finalText.isNotBlank()) {
                emitTranscript("user", finalText)
                mainHandler.post {
                    commandTextToSend = finalText
                    transitionTo(AgentState.PROCESSING)
                }
            } else {
                mainHandler.post { transitionTo(AgentState.IDLE) }
            }
        }

        override fun onPartialResults(partialResults: Bundle?) {
            val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            val partialText = matches?.firstOrNull() ?: ""
            if (partialText.isNotBlank()) {
                emitTranscript("user_partial", partialText)
            }
        }

        override fun onEvent(eventType: Int, params: Bundle?) {}
    }

    private fun startCommandListening() {
        mainHandler.post {
            try {
                speechRecognizer?.destroy()
                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this)
                speechRecognizer?.setRecognitionListener(commandListener)
                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                }
                speechRecognizer?.startListening(intent)
                Log.i(TAG, "Command listening started")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start command listening", e)
                transitionTo(AgentState.ERROR)
            }
        }
    }

    // ── API Client ────────────────────────────────────────────────

    private fun sendTextToServer() {
        val text = commandTextToSend
        if (text.isBlank()) {
            mainHandler.post { transitionTo(AgentState.IDLE) }
            return
        }

        // Always refresh token from SharedPreferences before API call
        refreshTokenFromPrefs()

        Log.i(TAG, "Sending text to server: $text")
        Log.i(TAG, "Backend URL: $backendUrl, Token length: ${authToken.length}")

        if (backendUrl.isBlank()) {
            Log.e(TAG, "Backend URL is empty!")
            mainHandler.post { transitionTo(AgentState.ERROR) }
            return
        }

        if (authToken.isBlank()) {
            Log.e(TAG, "Auth token is empty! Cannot call API.")
            emitTranscript("assistant", "Auth token missing. Please re-open the app.")
            mainHandler.post { transitionTo(AgentState.ERROR) }
            return
        }

        Thread {
            try {
                val jsonObject = org.json.JSONObject().apply {
                    put("message", text)
                    put("language", language)
                    sessionId?.let { put("sessionId", it) }
                    location?.let { put("location", it) }
                }

                val body = okhttp3.RequestBody.create("application/json".toMediaType(), jsonObject.toString())

                val request = Request.Builder()
                    .url("$backendUrl/api/chat")
                    .addHeader("Authorization", "Bearer $authToken")
                    .post(body)
                    .build()

                Log.i(TAG, "Sending request to: $backendUrl/api/chat")
                val response = httpClient.newCall(request).execute()
                val contentType = response.header("Content-Type") ?: ""
                Log.i(TAG, "Response code: ${response.code}, Content-Type: $contentType")

                if (!response.isSuccessful) {
                    val errorBody = response.body?.string() ?: "no body"
                    Log.e(TAG, "API error ${response.code}: $errorBody")
                    emitTranscript("assistant", "Server error (${response.code})")
                    mainHandler.post { transitionTo(AgentState.ERROR) }
                    return@Thread
                }

                if (!contentType.contains("text/event-stream")) {
                    val rawBody = response.body?.string() ?: ""
                    Log.w(TAG, "Response is not SSE! Body: $rawBody")
                    // If it's a plain JSON response containing 'response' or 'content'
                    try {
                        val json = org.json.JSONObject(rawBody)
                        if (json.has("transcript")) emitTranscript("user", json.getString("transcript"))
                        if (json.has("sessionId")) sessionId = json.getString("sessionId")
                        val content = if (json.has("content")) json.getString("content") else if (json.has("response")) json.getString("response") else rawBody
                        emitTranscript("assistant", content)
                        synchronized(speechQueue) { speechQueue.add(content) }
                        mainHandler.post { 
                            if (currentState == AgentState.PROCESSING) transitionTo(AgentState.SPEAKING)
                            speakNextSentence() 
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to parse non-SSE JSON", e)
                    }
                    return@Thread
                }

                val reader = BufferedReader(InputStreamReader(response.body?.byteStream()))
                var fullResponse = ""
                val sentenceBuffer = StringBuilder()

                reader.forEachLine { line ->
                    if (line.startsWith("data: ")) {
                        val dataStr = line.removePrefix("data: ").trim()
                        if (dataStr == "[DONE]") return@forEachLine

                        try {
                            val json = org.json.JSONObject(dataStr)
                            if (json.has("transcript")) {
                                emitTranscript("user", json.getString("transcript"))
                            }
                            if (json.has("sessionId")) {
                                sessionId = json.getString("sessionId")
                            }
                            if (json.has("content")) {
                                val chunk = json.getString("content")
                                fullResponse += chunk
                                sentenceBuffer.append(chunk)
                                
                                // Stream to UI instantly
                                emitTranscript("assistant", fullResponse)

                                // Split on sentence boundaries
                                val regex = Regex("^(.*?[.!?\\n])(.*)\$", RegexOption.DOT_MATCHES_ALL)
                                var match = regex.find(sentenceBuffer.toString())
                                while (match != null) {
                                    val sentence = match.groupValues[1].trim()
                                    val remainder = match.groupValues[2]
                                    sentenceBuffer.clear()
                                    sentenceBuffer.append(remainder)
                                    if (sentence.isNotEmpty()) {
                                        synchronized(speechQueue) { speechQueue.add(sentence) }
                                        mainHandler.post { speakNextSentence() }
                                    }
                                    match = regex.find(sentenceBuffer.toString())
                                }
                            }
                        } catch (parseErr: Exception) {
                            Log.w(TAG, "Parse error on SSE line: $line", parseErr)
                        }
                    }
                }

                // Flush remaining buffer
                val remaining = sentenceBuffer.toString().trim()
                if (remaining.isNotEmpty()) {
                    synchronized(speechQueue) { speechQueue.add(remaining) }
                    mainHandler.post { speakNextSentence() }
                }

                if (fullResponse.isNotEmpty()) {
                    emitTranscript("assistant", fullResponse)
                }

                if (currentState == AgentState.PROCESSING) {
                    mainHandler.post { transitionTo(AgentState.SPEAKING) }
                }

            } catch (e: Exception) {
                Log.e(TAG, "API call failed", e)
                emitTranscript("assistant", "Error: ${e.message}")
                mainHandler.post { transitionTo(AgentState.ERROR) }
            }
        }.start()
    }

    // ── TTS ───────────────────────────────────────────────────────

    private fun speakNextSentence() {
        if (isSpeakingUtterance) return
        val sentence: String
        synchronized(speechQueue) {
            if (speechQueue.isEmpty()) {
                if (currentState == AgentState.SPEAKING) {
                    transitionTo(AgentState.IDLE)
                }
                return
            }
            sentence = speechQueue.removeAt(0)
        }
        if (sentence.isBlank()) { speakNextSentence(); return }

        isSpeakingUtterance = true
        val params = Bundle().apply { putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_MUSIC) }
        tts?.speak(sentence, TextToSpeech.QUEUE_FLUSH, params, "utterance_${System.currentTimeMillis()}")
    }

    private fun onUtteranceDone() {
        isSpeakingUtterance = false
        speakNextSentence()
    }

    // ── Earcons ───────────────────────────────────────────────────

    private fun playEarcon(resId: Int, onComplete: () -> Unit) {
        try {
            val mp = MediaPlayer.create(this, resId)
            mp?.setOnCompletionListener { it.release(); onComplete() }
            mp?.start() ?: onComplete()
        } catch (e: Exception) {
            Log.w(TAG, "Earcon play failed", e)
            onComplete()
        }
    }

    // ── Audio Focus ───────────────────────────────────────────────

    private fun requestAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANT)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()
            audioFocusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
                .setAudioAttributes(attrs)
                .build()
            audioManager?.requestAudioFocus(audioFocusRequest!!)
        } else {
            @Suppress("DEPRECATION")
            audioManager?.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
        }
    }

    private fun releaseAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest?.let { audioManager?.abandonAudioFocusRequest(it) }
        } else {
            @Suppress("DEPRECATION")
            audioManager?.abandonAudioFocus(null)
        }
    }

    // ── Notification ──────────────────────────────────────────────

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "Bessie Voice Assistant", NotificationManager.IMPORTANCE_LOW)
            channel.description = "Background voice assistant"
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
        }
    }

    private fun buildNotification(text: String): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val contentPi = PendingIntent.getActivity(this, 0, launchIntent, PendingIntent.FLAG_IMMUTABLE)

        // Must set package for broadcast intents to work on Android 13+
        val stopIntent = Intent(ACTION_STOP).apply { setPackage(packageName) }
        val muteIntent = Intent(ACTION_MUTE).apply { setPackage(packageName) }
        val stopPi = PendingIntent.getBroadcast(this, 1, stopIntent, PendingIntent.FLAG_IMMUTABLE)
        val mutePi = PendingIntent.getBroadcast(this, 2, muteIntent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val muteLabel = if (isMuted.get()) "Unmute" else "Mute"

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("\uD83D\uDC04 Bessie")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(contentPi)
            .setOngoing(true)
            .addAction(android.R.drawable.ic_media_pause, "Stop", stopPi)
            .addAction(android.R.drawable.ic_lock_silent_mode, muteLabel, mutePi)
            .build()
    }

    private fun updateNotification() {
        val text = when (currentState) {
            AgentState.IDLE -> if (isMuted.get()) "Muted" else "Listening for \"Hey Dairy\"..."
            AgentState.WAKE_WORD_DETECTED -> "🎤 Recording..."
            AgentState.PROCESSING -> "🤔 Processing..."
            AgentState.SPEAKING -> "🔊 Speaking..."
            AgentState.ERROR -> "⚠️ Error occurred"
        }
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, buildNotification(text))
    }

    // ── Event Emitters ────────────────────────────────────────────

    private fun emitStateChanged(state: String) {
        emitEvent("AGENT_STATE_CHANGED", state)
    }

    private fun emitTranscript(type: String, text: String) {
        val map = Arguments.createMap().apply {
            putString("type", type)
            putString("text", text)
        }
        emitEvent("TRANSCRIPT_UPDATED", map)
    }

    private fun emitEvent(eventName: String, data: Any) {
        try {
            val reactApp = application as? ReactApplication ?: return
            val reactContext = reactApp.reactNativeHost.reactInstanceManager.currentReactContext ?: return
            val emitter = reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            when (data) {
                is String -> emitter.emit(eventName, data)
                is WritableMap -> emitter.emit(eventName, data)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to emit event $eventName", e)
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        instance = null
        stopWakeWordListening()
        tts?.stop()
        tts?.shutdown()
        releaseAudioFocus()
        try { unregisterReceiver(actionReceiver) } catch (_: Exception) {}
        Log.i(TAG, "Service destroyed")
        super.onDestroy()
    }
}
