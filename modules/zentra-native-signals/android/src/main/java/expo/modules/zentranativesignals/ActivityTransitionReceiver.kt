package expo.modules.zentranativesignals

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.time.Instant
import com.google.android.gms.location.ActivityTransitionResult

class ActivityTransitionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (!ActivityTransitionResult.hasResult(intent)) {
      return
    }

    val result = ActivityTransitionResult.extractResult(intent) ?: return

    result.transitionEvents.forEach { event ->
      ZentraNativeSignalsEventRegistry.dispatchActivityTransition(
        ActivityTransitionPayload(
          activityType = ActivityRecognitionMappings.mapActivityType(event.activityType),
          transitionType = ActivityRecognitionMappings.mapTransitionType(event.transitionType),
          confidence = 1.0,
          timestamp = Instant.now().toString(),
        ),
      )
    }
  }

  companion object {
    const val ACTION_ACTIVITY_TRANSITION = "expo.modules.zentranativesignals.ACTION_ACTIVITY_TRANSITION"
  }
}
