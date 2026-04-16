package expo.modules.zentranativesignals

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.ActivityRecognitionResult
import java.time.Instant

class ActivityUpdateReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (!ActivityRecognitionResult.hasResult(intent)) {
      return
    }

    val result = ActivityRecognitionResult.extractResult(intent) ?: return
    val probableActivity = result.mostProbableActivity ?: return
    val activityType = ActivityRecognitionMappings.mapActivityType(probableActivity.type)

    if (activityType == "unknown") {
      return
    }

    val payloads = ZentraNativeSignalsEventRegistry.prepareActivityObservation(
      activityType = activityType,
      confidence = (probableActivity.confidence / 100.0).coerceIn(0.0, 1.0),
      timestamp = Instant.now().toString(),
    )

    BufferedActivityTransitionStore.appendTransitions(context, payloads)
    ZentraNativeSignalsEventRegistry.emitActivityTransitions(payloads)
  }

  companion object {
    const val ACTION_ACTIVITY_UPDATE = "expo.modules.zentranativesignals.ACTION_ACTIVITY_UPDATE"
  }
}
