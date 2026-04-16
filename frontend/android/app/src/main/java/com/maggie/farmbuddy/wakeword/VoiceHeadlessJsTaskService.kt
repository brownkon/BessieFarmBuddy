package com.maggie.farmbuddy.wakeword

import android.content.Intent
import android.os.Bundle
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class VoiceHeadlessJsTaskService : HeadlessJsTaskService() {

    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        val extras = intent?.extras
        if (extras != null) {
            val taskName = "DairyVoiceBackgroundLoop"
            return HeadlessJsTaskConfig(
                taskName,
                if (extras != null) Arguments.fromBundle(extras) else Arguments.createMap(),
                0, // timeout for the task, 0 means no timeout
                true // allowed in foreground/background
            )
        }
        return null
    }
}
