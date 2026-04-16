package com.maggie.farmbuddy.wakeword

import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class WakeWordModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        var reactContextInstance: ReactApplicationContext? = null
    }

    init {
        reactContextInstance = reactContext
    }

    override fun getName(): String = "WakeWord"

    private fun hasAudioPermission(): Boolean {
        return reactApplicationContext.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
    }

    @ReactMethod
    fun startListening(promise: Promise) {
        val context = reactApplicationContext
        val serviceIntent = Intent(context, WakeWordService::class.java)

        try {
            if (WakeWordService.isServiceRunning) {
                promise.resolve(true)
                return
            }

            if (!hasAudioPermission()) {
                WakeWordService.setWakeWordEnabled(context, false)
                promise.resolve(false)
                return
            }

            WakeWordService.setWakeWordEnabled(context, true)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("START_ERROR", "Failed to start wake word service", e)
        }
    }

    @ReactMethod
    fun stopListening(promise: Promise) {
        val context = reactApplicationContext
        val serviceIntent = Intent(context, WakeWordService::class.java)

        try {
            WakeWordService.setWakeWordEnabled(context, false)
            context.stopService(serviceIntent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", "Failed to stop wake word service", e)
        }
    }

    @ReactMethod
    fun setWakeWordEnabled(enabled: Boolean, promise: Promise) {
        try {
            WakeWordService.setWakeWordEnabled(reactApplicationContext, enabled)
            if (!enabled) {
                val serviceIntent = Intent(reactApplicationContext, WakeWordService::class.java)
                reactApplicationContext.stopService(serviceIntent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SET_WAKE_WORD_ENABLED_ERROR", "Failed to update wake word setting", e)
        }
    }

    @ReactMethod
    fun setForegroundVoiceTabActive(active: Boolean, promise: Promise) {
        try {
            WakeWordService.setForegroundVoiceTabActive(active)
            if (WakeWordService.isServiceRunning) {
                val action = if (active) {
                    WakeWordService.ACTION_PAUSE_LISTENING
                } else {
                    WakeWordService.ACTION_RESUME_LISTENING
                }
                sendServiceAction(action)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SET_FOREGROUND_VOICE_TAB_ACTIVE_ERROR", "Failed to set tab foreground state", e)
        }
    }

    @ReactMethod
    fun getWakeWordStatus(promise: Promise) {
        try {
            val context = reactApplicationContext
            val status = Arguments.createMap().apply {
                putBoolean("enabled", WakeWordService.isWakeWordEnabled(context))
                putBoolean("running", WakeWordService.isServiceRunning)
                putBoolean("ignoringBatteryOptimizations", isIgnoringBatteryOptimizationsInternal())
                putBoolean("hasOverlayPermission", Settings.canDrawOverlays(context))
            }
            promise.resolve(status)
        } catch (e: Exception) {
            promise.reject("GET_WAKE_WORD_STATUS_ERROR", "Failed to read wake word status", e)
        }
    }

    @ReactMethod
    fun resumeListening(promise: Promise) {
        try {
            val context = reactApplicationContext
            if (!WakeWordService.isWakeWordEnabled(context)) {
                promise.resolve(false)
                return
            }

            sendServiceAction(WakeWordService.ACTION_RESUME_LISTENING)

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("RESUME_LISTENING_ERROR", "Failed to resume wake word listener", e)
        }
    }

    // Compatibility alias while JS migrates from previous naming.
    @ReactMethod
    fun resumeVosk(promise: Promise) {
        resumeListening(promise)
    }

    @ReactMethod
    fun duckAudio(promise: Promise) {
        try {
            val audioManager = reactApplicationContext.getSystemService(android.content.Context.AUDIO_SERVICE) as android.media.AudioManager
            val result = audioManager.requestAudioFocus(
                null,
                android.media.AudioManager.STREAM_MUSIC,
                android.media.AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
            )
            promise.resolve(result == android.media.AudioManager.AUDIOFOCUS_REQUEST_GRANTED)
        } catch (e: Exception) {
            promise.reject("AUDIO_DUCK_ERROR", "Failed to duck audio", e)
        }
    }

    @ReactMethod
    fun releaseAudio(promise: Promise) {
        try {
            val audioManager = reactApplicationContext.getSystemService(android.content.Context.AUDIO_SERVICE) as android.media.AudioManager
            audioManager.abandonAudioFocus(null)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("AUDIO_RELEASE_ERROR", "Failed to release audio", e)
        }
    }

    @ReactMethod
    fun updateNotification(text: String, promise: Promise) {
        try {
            val actionIntent = Intent(reactApplicationContext, WakeWordService::class.java).apply {
                action = WakeWordService.ACTION_UPDATE_NOTIFICATION
                putExtra("text", text)
            }
            sendServiceAction(actionIntent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("UPDATE_NOTIFICATION_ERROR", "Failed to update notification", e)
        }
    }

    @ReactMethod
    fun requestOverlayPermission(promise: Promise) {
        try {
            if (!Settings.canDrawOverlays(reactApplicationContext)) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    android.net.Uri.parse("package:" + reactApplicationContext.packageName)
                ).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactApplicationContext.startActivity(intent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OVERLAY_PERMISSION_ERROR", "Failed to open overlay settings", e)
        }
    }

    @ReactMethod
    fun hasOverlayPermission(promise: Promise) {
        promise.resolve(Settings.canDrawOverlays(reactApplicationContext))
    }

    @ReactMethod
    fun updateAssistantOverlayText(text: String, promise: Promise) {
        VoiceOverlayController.updateText(text)
        promise.resolve(true)
    }

    @ReactMethod
    fun hideAssistantOverlay(promise: Promise) {
        VoiceOverlayController.hideOverlay()
        promise.resolve(true)
    }

    @ReactMethod
    fun openBatteryOptimizationSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject(
                "OPEN_BATTERY_OPTIMIZATION_SETTINGS_ERROR",
                "Failed to open battery optimization settings",
                e
            )
        }
    }

    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        try {
            promise.resolve(isIgnoringBatteryOptimizationsInternal())
        } catch (e: Exception) {
            promise.reject("BATTERY_OPTIMIZATION_STATUS_ERROR", "Failed to read battery optimization status", e)
        }
    }

    private fun isIgnoringBatteryOptimizationsInternal(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return true
        }

        val powerManager = reactApplicationContext.getSystemService(PowerManager::class.java)
        return powerManager?.isIgnoringBatteryOptimizations(reactApplicationContext.packageName) == true
    }

    private fun sendServiceAction(action: String) {
        val intent = Intent(reactApplicationContext, WakeWordService::class.java).apply {
            this.action = action
        }
        sendServiceAction(intent)
    }

    private fun sendServiceAction(intent: Intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactApplicationContext.startForegroundService(intent)
        } else {
            reactApplicationContext.startService(intent)
        }
    }
}
