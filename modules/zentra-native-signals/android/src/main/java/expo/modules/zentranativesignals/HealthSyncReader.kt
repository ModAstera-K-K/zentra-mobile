package expo.modules.zentranativesignals

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.changes.DeletionChange
import androidx.health.connect.client.changes.UpsertionChange
import androidx.health.connect.client.records.*
import androidx.health.connect.client.request.*
import androidx.health.connect.client.time.TimeRangeFilter
import org.json.JSONObject
import java.time.Duration
import java.time.Instant
import kotlin.reflect.KClass

internal class HealthSyncReader(context: Context) {
  private val client = HealthConnectClient.getOrCreate(context)

  suspend fun page(type: String, start: String, end: String, cursor: String?): Map<String, Any?> {
    val state = cursor?.let { runCatching { JSONObject(it) }.getOrElse { return mapOf("records" to emptyList<Any>(), "deletedIds" to emptyList<String>(), "hasMore" to true, "reset" to true) } }
    val recordClass = recordClass(type)
    if (state?.optString("phase") == "changes") return changes(state.getString("token"), Instant.parse(start))
    val token = state?.optString("token")?.takeIf { it.isNotEmpty() }
      ?: client.getChangesToken(ChangesTokenRequest(setOf(recordClass)))
    val pageToken = state?.optString("page")?.takeIf { it.isNotEmpty() }
    val result = client.readRecords(ReadRecordsRequest(recordClass,
      timeRangeFilter = TimeRangeFilter.between(Instant.parse(start), Instant.parse(end)),
      pageSize = 200, pageToken = pageToken))
    val nextPage = result.pageToken?.takeIf { it.isNotEmpty() }
    val next = JSONObject().put("phase", if (nextPage == null) "changes" else "snapshot")
      .put("token", token).put("page", nextPage ?: "").toString()
    // Drain changes after the last snapshot page, including writes during the snapshot.
    return mapOf("records" to result.records.mapNotNull(::serialize), "deletedIds" to emptyList<String>(), "cursor" to next, "hasMore" to true)
  }

  private suspend fun changes(token: String, start: Instant): Map<String, Any?> {
    val result = client.getChanges(token)
    if (result.changesTokenExpired) return mapOf("records" to emptyList<Any>(), "deletedIds" to emptyList<String>(), "cursor" to null, "hasMore" to true, "reset" to true)
    return mapOf(
      "records" to result.changes.filterIsInstance<UpsertionChange>().mapNotNull { serialize(it.record)?.takeIf { record -> Instant.parse(record["endTime"] as String) >= start } },
      "deletedIds" to result.changes.filterIsInstance<DeletionChange>().map { it.recordId },
      "cursor" to JSONObject().put("phase", "changes").put("token", result.nextChangesToken).toString(),
      "hasMore" to result.hasMore)
  }

  suspend fun steps(start: String, end: String, minutes: Long = 60): List<Map<String, Any?>> {
    return client.aggregateGroupByDuration(AggregateGroupByDurationRequest(
      metrics = setOf(StepsRecord.COUNT_TOTAL),
      timeRangeFilter = TimeRangeFilter.between(Instant.parse(start), Instant.parse(end)),
      timeRangeSlicer = Duration.ofMinutes(minutes))).mapNotNull { bucket ->
      val count = bucket.result[StepsRecord.COUNT_TOTAL] ?: return@mapNotNull null
      mapOf("id" to "statistics-${bucket.startTime}", "recordType" to "steps",
        "startTime" to bucket.startTime.toString(), "endTime" to bucket.endTime.toString(),
        "valueNumeric" to count.toDouble(), "unit" to "count",
        "metadata" to mapOf("platform_aggregate" to true, "source_app" to "health_connect_statistics"))
    }
  }

  private fun recordClass(type: String): KClass<out Record> = when(type) {
    "steps" -> StepsRecord::class
    "sleep" -> SleepSessionRecord::class
    "heart_rate" -> HeartRateRecord::class
    "exercise_session" -> ExerciseSessionRecord::class
    else -> throw IllegalArgumentException("Unknown health record type")
  }

  private fun serialize(record: Record): Map<String, Any?>? = when(record) {
    is StepsRecord -> HealthConnectRecordSerializers.serializeStepsRecord(record)
    is SleepSessionRecord -> HealthConnectRecordSerializers.serializeSleepRecord(record)
    is HeartRateRecord -> HealthConnectRecordSerializers.serializeHeartRateRecord(record)
    is ExerciseSessionRecord -> HealthConnectRecordSerializers.serializeExerciseRecord(record)
    else -> null
  }
}
