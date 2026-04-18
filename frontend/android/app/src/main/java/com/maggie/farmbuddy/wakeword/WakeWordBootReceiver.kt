package com.maggie.farmbuddy.wakeword

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat

class WakeWordBootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "WakeWordBootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) {
            return
        }

        if (!WakeWordService.isWakeWordEnabled(context)) {
            Log.d(TAG, "Wake word disabled; skipping boot start")
            return
        }

        val hasAudioPermission = ContextCompat.checkSelfPermission(
            context,
            android.Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED

        if (!hasAudioPermission) {
            Log.w(TAG, "RECORD_AUDIO not granted; cannot auto-start wake word")
            return
        }

        val serviceIntent = Intent(context, WakeWordService::class.java)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
            Log.d(TAG, "Wake word service auto-started from boot")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to auto-start wake word service", e)
        }
    }
}
