package com.voidedflyer.dairyvoiceapp

import android.app.Activity
import android.content.Intent
import android.os.Bundle

class AssistantActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("assistant_invocation", true)
            action = intent?.action
        }

        startActivity(launchIntent)
        finish()
    }
}
