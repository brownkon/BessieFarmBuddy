package com.maggie.farmbuddy

import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import com.facebook.react.bridge.*

class VoiceAssistantModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "VoiceAssistantModule"

    private fun prefs(): SharedPreferences =
        reactContext.getSharedPreferences("bessie_voice_prefs", 0)

    @ReactMethod
    fun startService(config: ReadableMap) {
        val token = config.getString("authToken") ?: ""
        val url = config.getString("backendUrl") ?: ""
        android.util.Log.i("VoiceAssistantService", "[Module] startService called, token length: ${token.length}, url: $url")

        // Store in SharedPreferences so service can always read latest token
        prefs().edit()
            .putString("authToken", token)
            .putString("backendUrl", url)
            .apply()

        // Also set on companion directly
        VoiceAssistantService.authToken = token
        VoiceAssistantService.backendUrl = url

        val intent = Intent(reactContext, VoiceAssistantService::class.java).apply {
            putExtra("backendUrl", url)
            putExtra("authToken", token)
            if (config.hasKey("sessionId")) {
                putExtra("sessionId", config.getString("sessionId"))
                config.getString("sessionId")?.let { VoiceAssistantService.sessionId = it }
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactContext.startForegroundService(intent)
        } else {
            reactContext.startService(intent)
        }
    }

    @ReactMethod
    fun stopService() {
        VoiceAssistantService.instance?.let { service ->
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                service.cancelCurrentInteraction()
            }
        }
        reactContext.stopService(Intent(reactContext, VoiceAssistantService::class.java))
    }

    @ReactMethod
    fun startListening() {
        VoiceAssistantService.instance?.let { service ->
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                service.manualStartListening()
            }
        }
    }

    @ReactMethod
    fun stopAndCancel() {
        VoiceAssistantService.instance?.let { service ->
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                service.cancelCurrentInteraction()
            }
        }
    }

    @ReactMethod
    fun updateAuthToken(token: String) {
        android.util.Log.i("VoiceAssistantService", "[Module] updateAuthToken called, length: ${token.length}")
        VoiceAssistantService.authToken = token
        prefs().edit().putString("authToken", token).apply()
    }

    @ReactMethod
    fun updateSessionId(sessionId: String) {
        VoiceAssistantService.sessionId = sessionId
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
