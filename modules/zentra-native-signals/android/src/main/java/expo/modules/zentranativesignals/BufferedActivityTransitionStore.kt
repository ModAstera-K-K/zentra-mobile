package expo.modules.zentranativesignals

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

internal object BufferedActivityTransitionStore {
  private const val PREFERENCES_NAME = "zentra_native_signals"
  private const val KEY_BUFFERED_ACTIVITY_TRANSITIONS = "buffered_activity_transitions"
  private const val KEY_NEXT_ACTIVITY_TRANSITION_CURSOR = "next_activity_transition_cursor"
  private const val MAX_BUFFERED_TRANSITIONS = 2_000

  data class BufferedActivityTransitionRecord(
    val cursor: Long,
    val payload: ActivityTransitionPayload,
  )

  fun appendTransitions(context: Context, payloads: List<ActivityTransitionPayload>) {
    if (payloads.isEmpty()) {
      return
    }

    synchronized(this) {
      val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
      val bufferedTransitions = loadTransitions(preferences.getString(KEY_BUFFERED_ACTIVITY_TRANSITIONS, null))
      val knownIds = bufferedTransitions.mapTo(mutableSetOf()) { it.payload.id }
      var nextCursor = maxOf(
        preferences.getLong(KEY_NEXT_ACTIVITY_TRANSITION_CURSOR, 1L),
        (bufferedTransitions.maxOfOrNull { it.cursor } ?: 0L) + 1L,
      )

      payloads.forEach { payload ->
        if (knownIds.add(payload.id)) {
          bufferedTransitions.add(
            BufferedActivityTransitionRecord(
              cursor = nextCursor++,
              payload = payload,
            ),
          )
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
        .putLong(KEY_NEXT_ACTIVITY_TRANSITION_CURSOR, nextCursor)
        .apply()
    }
  }

  fun getBufferedTransitions(context: Context): List<ActivityTransitionPayload> {
    return getBufferedTransitionRecords(context).map { it.payload }
  }

  fun getBufferedTransitionRecords(context: Context): List<BufferedActivityTransitionRecord> {
    synchronized(this) {
      val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
      return loadTransitions(preferences.getString(KEY_BUFFERED_ACTIVITY_TRANSITIONS, null))
    }
  }

  fun getBufferedTransitionsSince(
    context: Context,
    cursorExclusive: Long?,
    limit: Int,
  ): List<BufferedActivityTransitionRecord> {
    val normalizedLimit = limit.coerceAtLeast(1)
    return getBufferedTransitionRecords(context)
      .asSequence()
      .filter { record -> cursorExclusive == null || record.cursor > cursorExclusive }
      .take(normalizedLimit)
      .toList()
  }

  fun getBufferedTransitionCount(context: Context): Int {
    return getBufferedTransitionRecords(context).size
  }

  fun acknowledgeTransitions(context: Context, ids: List<String>): Int {
    if (ids.isEmpty()) {
      return 0
    }

    synchronized(this) {
      val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
      val bufferedTransitions = loadTransitions(preferences.getString(KEY_BUFFERED_ACTIVITY_TRANSITIONS, null))
      val acknowledgedIds = ids.toSet()
      val remainingTransitions = bufferedTransitions.filterNot { it.payload.id in acknowledgedIds }
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

  private fun loadTransitions(rawPayloads: String?): MutableList<BufferedActivityTransitionRecord> {
    if (rawPayloads.isNullOrBlank()) {
      return mutableListOf()
    }

    return try {
      val payloads = JSONArray(rawPayloads)
      MutableList(payloads.length()) { index ->
        val payload = payloads.getJSONObject(index)
        BufferedActivityTransitionRecord(
          cursor = payload.optLong("cursor", (index + 1).toLong()),
          payload = ActivityTransitionPayload(
            id = payload.getString("id"),
            activityType = payload.getString("activityType"),
            transitionType = payload.getString("transitionType"),
            confidence = payload.getDouble("confidence"),
            timestamp = payload.getString("timestamp"),
          ),
        )
      }
    } catch (_: Throwable) {
      mutableListOf()
    }
  }

  private fun serializeTransitions(payloads: List<BufferedActivityTransitionRecord>): String {
    val jsonArray = JSONArray()
    payloads.forEach { record ->
      jsonArray.put(
        JSONObject()
          .put("cursor", record.cursor)
          .put("id", record.payload.id)
          .put("activityType", record.payload.activityType)
          .put("transitionType", record.payload.transitionType)
          .put("confidence", record.payload.confidence)
          .put("timestamp", record.payload.timestamp),
      )
    }

    return jsonArray.toString()
  }
}