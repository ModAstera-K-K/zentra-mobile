package expo.modules.zentranativesignals

import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.DetectedActivity

internal object ActivityRecognitionMappings {
  fun mapActivityType(activityType: Int): String =
    when (activityType) {
      DetectedActivity.STILL -> "still"
      DetectedActivity.WALKING -> "walking"
      DetectedActivity.RUNNING -> "running"
      DetectedActivity.IN_VEHICLE -> "vehicle"
      DetectedActivity.ON_BICYCLE -> "bike"
      else -> "unknown"
    }

  fun mapTransitionType(transitionType: Int): String =
    when (transitionType) {
      ActivityTransition.ACTIVITY_TRANSITION_ENTER -> "enter"
      ActivityTransition.ACTIVITY_TRANSITION_EXIT -> "exit"
      else -> "enter"
    }
}
