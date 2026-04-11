package expo.modules.zentranativesignals

internal data class ActivityTransitionPayload(
  val activityType: String,
  val transitionType: String,
  val confidence: Double,
  val timestamp: String,
)

internal object ZentraNativeSignalsEventRegistry {
  private var activityTransitionListener: ((ActivityTransitionPayload) -> Unit)? = null
  private var lastObservedActivityType: String? = null

  fun setActivityTransitionListener(listener: ((ActivityTransitionPayload) -> Unit)?) {
    activityTransitionListener = listener
  }

  fun dispatchActivityObservation(
    activityType: String,
    confidence: Double,
    timestamp: String,
  ) {
    if (activityType == lastObservedActivityType) {
      return
    }

    lastObservedActivityType?.let { previousActivityType ->
      activityTransitionListener?.invoke(
        ActivityTransitionPayload(
          activityType = previousActivityType,
          transitionType = "exit",
          confidence = confidence,
          timestamp = timestamp,
        ),
      )
    }

    lastObservedActivityType = activityType
    activityTransitionListener?.invoke(
      ActivityTransitionPayload(
        activityType = activityType,
        transitionType = "enter",
        confidence = confidence,
        timestamp = timestamp,
      ),
    )
  }

  fun dispatchActivityTransition(payload: ActivityTransitionPayload) {
    when (payload.transitionType) {
      "enter" -> {
        if (lastObservedActivityType == payload.activityType) {
          return
        }
        lastObservedActivityType = payload.activityType
      }
      "exit" -> {
        if (lastObservedActivityType != payload.activityType) {
          return
        }
        lastObservedActivityType = null
      }
    }

    activityTransitionListener?.invoke(payload)
  }

  fun resetActivityState() {
    lastObservedActivityType = null
  }
}
