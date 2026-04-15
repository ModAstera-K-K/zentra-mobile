package expo.modules.zentranativesignals

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

internal object BufferedActivityTransitionStore {
  private const val PREFERENCES_NAME = "zentra_native_signals"
  private const val KEY_BUFFERED_ACTIVITY_TRANSITIONS = "buffered_activity_transitions"
  private const val MAX_BUFFERED_TRANSITIONS = 2_000

  fun appendTransitions(context: Context, payloads: List<ActivityTransitionPayload>) {
    if (payloads.isEmpty()) {
      return
    }

    synchronized(this) {
      val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
      val bufferedTransitions = loadTransitions(preferences.getString(KEY_BUFFERED_ACTIVITY_TRANSITIONS, null))
      val knownIds = bufferedTransitions.mapTo(mutableSetOf()) { it.id }

      payloads.forEach { payload ->
        if (knownIds.add(payload.id)) {
          bufferedTransitions.add(payload)
        }
      }

      if (bufferedTransitions.size > MAX_BUFFERED_TRANSITIONS) {
        val overflowCount = bufferedTransitions.size - MAX_BUFFERED_TRANSITIONS
        repeat(overflowCount) {
          bufferedTransitions.removeAt(0)
        }
      }

      preferences.edit()
        .putString(KEY_BUFFERED_ACTIVITY_TRANSITIONS, serializeTransitions(bufferedTransitions))
        .apply()
    }
  }

  fun getBufferedTransitions(context: Context): List<ActivityTransitionPayload> {
    synchronized(this) {
      val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
      return loadTransitions(preferences.getString(KEY_BUFFERED_ACTIVITY_TRANSITIONS, null))
    }
  }

  fun acknowledgeTransitions(context: Context, ids: List<String>): Int {
    if (ids.isEmpty()) {
      return 0
    }

    synchronized(this) {
      val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
      val bufferedTransitions = loadTransitions(preferences.getString(KEY_BUFFERED_ACTIVITY_TRANSITIONS, null))
      val acknowledgedIds = ids.toSet()
      val remainingTransitions = bufferedTransitions.filterNot { it.id in acknowledgedIds }
      val removedCount = bufferedTransitions.size - remainingTransitions.size

      if (removedCount == 0) {
        return 0
      }

      preferences.edit()
        .putString(KEY_BUFFERED_ACTIVITY_TRANSITIONS, serializeTransitions(remainingTransitions))
        .apply()

      return removedCount
    }
  }

  private fun loadTransitions(rawPayloads: String?): MutableList<ActivityTransitionPayload> {
    if (rawPayloads.isNullOrBlank()) {
      return mutableListOf()
    }

    return try {
      val payloads = JSONArray(rawPayloads)
      MutableList(payloads.length()) { index ->
        val payload = payloads.getJSONObject(index)
        ActivityTransitionPayload(
          id = payload.getString("id"),
          activityType = payload.getString("activityType"),
          transitionType = payload.getString("transitionType"),
          confidence = payload.getDouble("confidence"),
          timestamp = payload.getString("timestamp"),
        )
      }
    } catch (_: Throwable) {
      mutableListOf()
    }
  }

  private fun serializeTransitions(payloads: List<ActivityTransitionPayload>): String {
    val jsonArray = JSONArray()
    payloads.forEach { payload ->
      jsonArray.put(
        JSONObject()
          .put("id", payload.id)
          .put("activityType", payload.activityType)
          .put("transitionType", payload.transitionType)
          .put("confidence", payload.confidence)
          .put("timestamp", payload.timestamp),
      )
    }

    return jsonArray.toString()
  }
}