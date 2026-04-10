package expo.modules.zentranativesignals

import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import org.json.JSONObject
import java.time.Duration

internal object HealthConnectRecordSerializers {
  fun serializeStepsRecord(record: StepsRecord): Map<String, Any?> {
    return mapOf(
      "id" to (record.metadata.id ?: fallbackRecordId("steps", record.startTime.toString(), record.endTime.toString())),
      "recordType" to "steps",
      "startTime" to record.startTime.toString(),
      "endTime" to record.endTime.toString(),
      "valueNumeric" to record.count.toDouble(),
      "valueText" to null,
      "valueJson" to null,
      "unit" to "count",
      "metadata" to emptyMap<String, Any>(),
    )
  }

  fun serializeSleepRecord(record: SleepSessionRecord): Map<String, Any?> {
    return mapOf(
      "id" to (record.metadata.id ?: fallbackRecordId("sleep", record.startTime.toString(), record.endTime.toString())),
      "recordType" to "sleep",
      "startTime" to record.startTime.toString(),
      "endTime" to record.endTime.toString(),
      "valueNumeric" to Duration.between(record.startTime, record.endTime).toMinutes().toDouble(),
      "valueText" to null,
      "valueJson" to null,
      "unit" to "minutes",
      "metadata" to emptyMap<String, Any>(),
    )
  }

  fun serializeHeartRateRecord(record: HeartRateRecord): Map<String, Any?>? {
    if (record.samples.isEmpty()) {
      return null
    }

    val values = record.samples.map { it.beatsPerMinute.toDouble() }
    val average = values.average()
    val summary = JSONObject()
      .put("sample_count", values.size)
      .put("min_bpm", values.minOrNull() ?: average)
      .put("max_bpm", values.maxOrNull() ?: average)
      .toString()

    return mapOf(
      "id" to (record.metadata.id ?: fallbackRecordId("heart-rate", record.startTime.toString(), record.endTime.toString())),
      "recordType" to "heart_rate",
      "startTime" to record.startTime.toString(),
      "endTime" to record.endTime.toString(),
      "valueNumeric" to average,
      "valueText" to null,
      "valueJson" to summary,
      "unit" to "bpm",
      "metadata" to mapOf("sample_count" to values.size),
    )
  }

  fun serializeExerciseRecord(record: ExerciseSessionRecord): Map<String, Any?> {
    return mapOf(
      "id" to (record.metadata.id ?: fallbackRecordId("exercise", record.startTime.toString(), record.endTime.toString())),
      "recordType" to "exercise_session",
      "startTime" to record.startTime.toString(),
      "endTime" to record.endTime.toString(),
      "valueNumeric" to Duration.between(record.startTime, record.endTime).seconds.toDouble(),
      "valueText" to record.exerciseType.toString(),
      "valueJson" to null,
      "unit" to "seconds",
      "metadata" to emptyMap<String, Any>(),
    )
  }

  private fun fallbackRecordId(prefix: String, startTime: String, endTime: String): String {
    return "$prefix-$startTime-$endTime"
  }
}
