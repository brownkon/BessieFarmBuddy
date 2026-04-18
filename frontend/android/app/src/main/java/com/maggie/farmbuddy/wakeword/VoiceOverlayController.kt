package com.maggie.farmbuddy.wakeword

import android.animation.ObjectAnimator
import android.animation.PropertyValuesHolder
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import android.widget.TextView
import android.graphics.drawable.GradientDrawable
import com.maggie.farmbuddy.R

object VoiceOverlayController {
    private enum class OverlayVisualState {
        IDLE,
        LISTENING,
        THINKING,
        RESPONDING,
        ALERT,
    }

    private var overlayView: View? = null
    private var windowManager: WindowManager? = null
    private var statusTextView: TextView? = null
    private var detailTextView: TextView? = null
    private var pillContainerView: View? = null
    private var pillRingView: View? = null
    private var mascotRingView: View? = null
    private var mascotImageView: ImageView? = null
    private var mascotPulseAnimator: ObjectAnimator? = null
    private var lastVisualState: OverlayVisualState = OverlayVisualState.IDLE
    private val mainHandler = Handler(Looper.getMainLooper())

    fun showOverlay(context: Context, text: String = "Listening...") {
        if (!android.provider.Settings.canDrawOverlays(context)) {
            return
        }
        
        mainHandler.post {
            if (overlayView != null) {
                updateText(text)
                return@post
            }

            windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            
            val layoutParams = WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                } else {
                    WindowManager.LayoutParams.TYPE_PHONE
                },
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH or
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED,
                PixelFormat.TRANSLUCENT
            )
            
            // Position near top center
            layoutParams.gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            layoutParams.y = (24 * context.resources.displayMetrics.density).toInt()

            val inflater = LayoutInflater.from(context)
            try {
                overlayView = inflater.inflate(R.layout.voice_overlay, null)
                statusTextView = overlayView?.findViewById(R.id.text_voice_status)
                detailTextView = overlayView?.findViewById(R.id.text_voice_detail)
                detailTextView?.movementMethod = android.text.method.ScrollingMovementMethod()
                pillContainerView = overlayView?.findViewById(R.id.voice_pill_container)
                pillRingView = overlayView?.findViewById(R.id.voice_pill_ring)
                mascotRingView = overlayView?.findViewById(R.id.voice_mascot_ring)
                mascotImageView = overlayView?.findViewById(R.id.icon_voice_mascot)
                pillRingView?.visibility = View.GONE

                // Dismiss on tap so user isn't stuck
                overlayView?.setOnClickListener {
                    hideOverlay()
                }
                overlayView?.setOnTouchListener { _, event ->
                    if (event.action == MotionEvent.ACTION_OUTSIDE) {
                        hideOverlay()
                    }
                    false
                }

                windowManager?.addView(overlayView, layoutParams)
                updateText(text)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    fun updateText(text: String) {
        mainHandler.post {
            applyStateFromText(text)
        }
    }

    private fun applyStateFromText(text: String) {
        val message = text.trim().ifEmpty { "Waiting for voice input" }
        val lower = message.lowercase()

        val visualState: OverlayVisualState
        val statusLabel: String
        val detailLabel: String

        when {
            lower.contains("listening") -> {
                visualState = OverlayVisualState.LISTENING
                statusLabel = "LISTENING"
                detailLabel = "Waiting for farmer command"
            }

            lower.contains("thinking") || lower.contains("sending to agent") -> {
                visualState = OverlayVisualState.THINKING
                statusLabel = "THINKING"
                detailLabel = "Analyzing request"
            }

            lower.startsWith("you:") -> {
                visualState = OverlayVisualState.LISTENING
                statusLabel = "YOU SAID"
                detailLabel = message.removePrefix("YOU:").trim()
            }

            lower.startsWith("ai:") -> {
                visualState = OverlayVisualState.RESPONDING
                statusLabel = "RESPONDING"
                detailLabel = message.removePrefix("AI:").trim()
            }

            lower.contains("no speech") || lower.contains("error") -> {
                visualState = OverlayVisualState.ALERT
                statusLabel = "ALERT"
                detailLabel = message
            }

            lastVisualState == OverlayVisualState.THINKING -> {
                visualState = OverlayVisualState.RESPONDING
                statusLabel = "RESPONDING"
                detailLabel = message
            }

            else -> {
                visualState = OverlayVisualState.LISTENING
                statusLabel = "YOU SAID"
                detailLabel = message
            }
        }

        statusTextView?.text = statusLabel
        detailTextView?.text = detailLabel
        applyVisualState(visualState)
    }

    private fun applyVisualState(state: OverlayVisualState) {
        val accent = when (state) {
            OverlayVisualState.LISTENING -> Color.parseColor("#FF6A00")
            OverlayVisualState.THINKING -> Color.parseColor("#F0B429")
            OverlayVisualState.RESPONDING -> Color.parseColor("#1FA35B")
            OverlayVisualState.ALERT -> Color.parseColor("#C7362F")
            OverlayVisualState.IDLE -> Color.parseColor("#5C6872")
        }

        statusTextView?.setTextColor(accent)
        setStrokeColor(pillContainerView, accent, 2)
        setStrokeColor(mascotRingView, withAlpha(accent, 170), 2)
        setStrokeColor(mascotImageView, withAlpha(accent, 190), 2)

        val pulseDuration = when (state) {
            OverlayVisualState.LISTENING -> 850L
            OverlayVisualState.THINKING -> 1450L
            OverlayVisualState.RESPONDING -> 1150L
            OverlayVisualState.ALERT -> 800L
            OverlayVisualState.IDLE -> 0L
        }

        if (pulseDuration > 0L) {
            startPulseAnimations(pulseDuration)
        } else {
            stopPulseAnimations()
        }

        lastVisualState = state
    }

    private fun setStrokeColor(view: View?, color: Int, strokeWidthDp: Int) {
        val drawable = view?.background as? GradientDrawable ?: return
        drawable.setStroke(strokeWidthDp, color)
    }

    private fun withAlpha(color: Int, alpha: Int): Int {
        return Color.argb(alpha, Color.red(color), Color.green(color), Color.blue(color))
    }

    private fun startPulseAnimations(duration: Long) {
        stopPulseAnimations()

        mascotRingView?.let { ring ->
            val mascotAnimator = ObjectAnimator.ofPropertyValuesHolder(
                ring,
                PropertyValuesHolder.ofFloat(View.SCALE_X, 1f, 1.12f, 1f),
                PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f, 1.12f, 1f),
                PropertyValuesHolder.ofFloat(View.ALPHA, 0.45f, 1f, 0.45f),
            )
            mascotAnimator.duration = duration
            mascotAnimator.repeatCount = ValueAnimator.INFINITE
            mascotAnimator.repeatMode = ValueAnimator.RESTART
            mascotAnimator.start()
            this.mascotPulseAnimator = mascotAnimator
        }
    }

    private fun stopPulseAnimations() {
        mascotPulseAnimator?.cancel()
        mascotPulseAnimator = null
        mascotRingView?.alpha = 0.7f
        mascotRingView?.scaleX = 1f
        mascotRingView?.scaleY = 1f
    }

    fun hideOverlay() {
        mainHandler.post {
            stopPulseAnimations()
            if (overlayView != null) {
                try {
                    windowManager?.removeView(overlayView)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
                overlayView = null
            }
            statusTextView = null
            detailTextView = null
            pillContainerView = null
            pillRingView = null
            mascotRingView = null
            mascotImageView = null
            lastVisualState = OverlayVisualState.IDLE
        }
    }
}
