package expo.modules.zentranativesignals

internal data class ActivityTransitionPayload(
  val activityType: String,
  val transitionType: String,
  val confidence: Double,
  val timestamp: String,
)

internal object ZentraNativeSignalsEventRegistry {
  private var activityTransitionListener: ((ActivityTransitionPayload) -> Unit)? = null

  fun setActivityTransitionListener(listener: ((ActivityTransitionPayload) -> Unit)?) {
    activityTransitionListener = listener
  }

  fun dispatchActivityTransition(payload: ActivityTransitionPayload) {
    activityTransitionListener?.invoke(payload)
  }
}
