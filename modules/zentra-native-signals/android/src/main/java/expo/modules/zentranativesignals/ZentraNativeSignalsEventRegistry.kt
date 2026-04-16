package expo.modules.zentranativesignals

internal data class ActivityTransitionPayload(
  val id: String,
  val activityType: String,
  val transitionType: String,
  val confidence: Double,
  val timestamp: String,
)

internal fun createActivityTransitionPayload(
  activityType: String,
  transitionType: String,
  confidence: Double,
  timestamp: String,
): ActivityTransitionPayload {
  return ActivityTransitionPayload(
    id = "activity-$activityType-$transitionType-$timestamp",
    activityType = activityType,
    transitionType = transitionType,
    confidence = confidence,
    timestamp = timestamp,
  )
}

internal object ZentraNativeSignalsEventRegistry {
  private var activityTransitionListener: ((ActivityTransitionPayload) -> Unit)? = null
  private var lastObservedActivityType: String? = null

  fun setActivityTransitionListener(listener: ((ActivityTransitionPayload) -> Unit)?) {
    activityTransitionListener = listener
  }

  fun prepareActivityObservation(
    activityType: String,
    confidence: Double,
    timestamp: String,
  ): List<ActivityTransitionPayload> {
    if (activityType == lastObservedActivityType) {
      return emptyList()
    }

    val payloads = mutableListOf<ActivityTransitionPayload>()

    lastObservedActivityType?.let { previousActivityType ->
      payloads.add(
        createActivityTransitionPayload(
          activityType = previousActivityType,
          transitionType = "exit",
          confidence = confidence,
          timestamp = timestamp,
        ),
      )
    }

    lastObservedActivityType = activityType
    payloads.add(
      createActivityTransitionPayload(
        activityType = activityType,
        transitionType = "enter",
        confidence = confidence,
        timestamp = timestamp,
      ),
    )

    return payloads
  }

  fun prepareActivityTransition(payload: ActivityTransitionPayload): List<ActivityTransitionPayload> {
    when (payload.transitionType) {
      "enter" -> {
        if (lastObservedActivityType == payload.activityType) {
          return emptyList()
        }
        lastObservedActivityType = payload.activityType
      }
      "exit" -> {
        if (lastObservedActivityType != payload.activityType) {
          return emptyList()
        }
        lastObservedActivityType = null
      }
    }

    return listOf(payload)
  }

  fun emitActivityTransitions(payloads: List<ActivityTransitionPayload>) {
    if (payloads.isEmpty()) {
      return
    }

    payloads.forEach { payload ->
      activityTransitionListener?.invoke(payload)
    }
  }

  fun resetActivityState() {
    lastObservedActivityType = null
  }
}
