package com.voidedflyer.dairyvoiceapp.wakeword

import android.app.Activity
import android.app.ActivityManager
import android.app.role.RoleManager
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import androidx.core.app.ActivityCompat
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class WakeWordModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        var reactContextInstance: ReactApplicationContext? = null
        private const val REQUEST_CODE_ASSISTANT_ROLE = 8102
        private const val TAG = "WakeWordModule"
    }

    private var pendingAssistantRolePromise: Promise? = null

    private val activityEventListener: ActivityEventListener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            if (requestCode != REQUEST_CODE_ASSISTANT_ROLE) {
                return
            }

            val promise = pendingAssistantRolePromise
            pendingAssistantRolePromise = null

            if (promise == null) {
                return
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val roleManager = reactApplicationContext.getSystemService(RoleManager::class.java)
                promise.resolve(roleManager?.isRoleHeld(RoleManager.ROLE_ASSISTANT) == true)
            } else {
                promise.resolve(false)
            }
        }
    }

    init {
        reactContextInstance = reactContext
        reactContext.addActivityEventListener(activityEventListener)
    }

    override fun getName(): String {
        return "WakeWord"
    }

    private fun isAppInForeground(): Boolean {
        val activityManager = reactApplicationContext.getSystemService(ActivityManager::class.java)
            ?: return false
        val packageName = reactApplicationContext.packageName

        @Suppress("DEPRECATION")
        val processes = activityManager.runningAppProcesses ?: return false
        return processes.any { proc ->
            proc.processName == packageName &&
                (proc.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND ||
                    proc.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE)
        }
    }

    private fun hasRequiredModelAssets(): Boolean {
        return try {
            val modelRootEntries = reactApplicationContext.assets.list("model")?.toSet() ?: emptySet()
            if (modelRootEntries.isEmpty()) {
                Log.e(TAG, "assets/model is missing or empty")
                return false
            }

            if (!modelRootEntries.contains("uuid")) {
                Log.e(TAG, "assets/model/uuid missing; model package is not valid for Vosk StorageService")
                return false
            }

            val requiredPaths = listOf(
                "model/conf/mfcc.conf",
                "model/am/final.mdl",
                "model/graph/HCLr.fst",
            )

            requiredPaths.all { path ->
                reactApplicationContext.assets.open(path).use { }
                true
            }
        } catch (e: Exception) {
            Log.e(TAG, "Model validation failed", e)
            false
        }
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

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !isAppInForeground()) {
                promise.resolve(false)
                return
            }

            if (!hasRequiredModelAssets()) {
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
            promise.reject("START_ERROR", "Failed to start service", e)
        }
    }

    @ReactMethod
    fun stopListening(promise: Promise) {
        val context = reactApplicationContext
        val serviceIntent = Intent(context, WakeWordService::class.java)
        
        try {
            context.stopService(serviceIntent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", "Failed to stop service", e)
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
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SET_FOREGROUND_VOICE_TAB_ACTIVE_ERROR", "Failed to set voice tab foreground state", e)
        }
    }

    @ReactMethod
    fun getWakeWordStatus(promise: Promise) {
        try {
            val context = reactApplicationContext
            val status = Arguments.createMap().apply {
                putBoolean("enabled", WakeWordService.isWakeWordEnabled(context))
                putBoolean("running", WakeWordService.isServiceRunning)
                putBoolean("canRequestAssistantRole", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
                putBoolean("assistantRoleHeld", isAssistantRoleHeld())
                putBoolean("ignoringBatteryOptimizations", isIgnoringBatteryOptimizationsInternal())
                putBoolean("hasOverlayPermission", android.provider.Settings.canDrawOverlays(context))
            }
            promise.resolve(status)
        } catch (e: Exception) {
            promise.reject("GET_WAKE_WORD_STATUS_ERROR", "Failed to get wake word status", e)
        }
    }

    @ReactMethod
    fun resumeVosk(promise: Promise) {
        try {
            val context = reactApplicationContext
            val serviceIntent = Intent(context, WakeWordService::class.java).apply {
                action = WakeWordService.ACTION_RESUME_VOSK
            }

            if (!WakeWordService.isWakeWordEnabled(context)) {
                promise.resolve(false)
                return
            }

            if (WakeWordService.isServiceRunning) {
                context.startService(serviceIntent)
                promise.resolve(true)
                return
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !isAppInForeground()) {
                promise.resolve(false)
                return
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("RESUME_VOSK_ERROR", "Failed to resume Vosk", e)
        }
    }

    @ReactMethod
    fun duckAudio(promise: Promise) {
        try {
            val audioManager = reactApplicationContext.getSystemService(android.content.Context.AUDIO_SERVICE) as android.media.AudioManager
            val res = audioManager.requestAudioFocus(
                null,
                android.media.AudioManager.STREAM_MUSIC,
                android.media.AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
            )
            promise.resolve(res == android.media.AudioManager.AUDIOFOCUS_REQUEST_GRANTED)
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
            promise.reject("AUDIO_RELEASE_ERROR", "Failed to release audio focus", e)
        }
    }

    @ReactMethod
    fun requestAssistantRole(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            openAssistantSettings(promise)
            return
        }

        val roleManager = reactApplicationContext.getSystemService(RoleManager::class.java)
        if (roleManager == null || !roleManager.isRoleAvailable(RoleManager.ROLE_ASSISTANT)) {
            openAssistantSettings(promise)
            return
        }

        if (roleManager.isRoleHeld(RoleManager.ROLE_ASSISTANT)) {
            promise.resolve(true)
            return
        }

        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            val fallbackPromise = promise
            openAssistantSettings(fallbackPromise)
            return
        }

        if (pendingAssistantRolePromise != null) {
            promise.reject("ASSISTANT_ROLE_PENDING", "Assistant role request already in progress")
            return
        }

        pendingAssistantRolePromise = promise
        try {
            val intent = roleManager.createRequestRoleIntent(RoleManager.ROLE_ASSISTANT)
            ActivityCompat.startActivityForResult(activity, intent, REQUEST_CODE_ASSISTANT_ROLE, null)
        } catch (e: Exception) {
            pendingAssistantRolePromise = null
            promise.reject("REQUEST_ASSISTANT_ROLE_ERROR", "Failed to request assistant role", e)
        }
    }

    @ReactMethod
    fun openAssistantSettings(promise: Promise) {
        try {
            val intents = listOf(
                Intent(Settings.ACTION_VOICE_INPUT_SETTINGS),
                Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS)
            )

            val packageManager = reactApplicationContext.packageManager
            val selectedIntent = intents.firstOrNull { candidate ->
                candidate.resolveActivity(packageManager) != null
            }

            if (selectedIntent == null) {
                promise.reject("OPEN_ASSISTANT_SETTINGS_ERROR", "No assistant settings activity available")
                return
            }

            selectedIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(selectedIntent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OPEN_ASSISTANT_SETTINGS_ERROR", "Failed to open assistant settings", e)
        }
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

    private fun isAssistantRoleHeld(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return false
        }
        val roleManager = reactApplicationContext.getSystemService(RoleManager::class.java)
        return roleManager?.isRoleHeld(RoleManager.ROLE_ASSISTANT) == true
    }

    private fun isIgnoringBatteryOptimizationsInternal(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return true
        }
        val powerManager = reactApplicationContext.getSystemService(PowerManager::class.java)
        return powerManager?.isIgnoringBatteryOptimizations(reactApplicationContext.packageName) == true
    }

    @ReactMethod
    fun updateNotification(text: String, promise: Promise) {
        try {
            val context = reactApplicationContext
            val serviceIntent = Intent(context, WakeWordService::class.java).apply {
                action = WakeWordService.ACTION_UPDATE_NOTIFICATION
                putExtra("text", text)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("UPDATE_NOTIFICATION_ERROR", "Failed to update notification", e)
        }
    }

    @ReactMethod
    fun requestOverlayPermission(promise: Promise) {
        try {
            if (!android.provider.Settings.canDrawOverlays(reactApplicationContext)) {
                val intent = Intent(
                    android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    android.net.Uri.parse("package:" + reactApplicationContext.packageName)
                )
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactApplicationContext.startActivity(intent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OVERLAY_PERMISSION_ERROR", "Failed to open settings", e)
        }
    }

    @ReactMethod
    fun hasOverlayPermission(promise: Promise) {
        promise.resolve(android.provider.Settings.canDrawOverlays(reactApplicationContext))
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
}
