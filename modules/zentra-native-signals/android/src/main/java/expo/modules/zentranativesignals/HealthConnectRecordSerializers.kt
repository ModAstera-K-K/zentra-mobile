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
      "valueNumeric" to Duration.between(record.startTime, record.endTime).toMinutes().toDouble(),
      "valueText" to mapExerciseType(record.exerciseType),
      "valueJson" to null,
      "unit" to "minutes",
      "metadata" to emptyMap<String, Any>(),
    )
  }

  private fun mapExerciseType(type: Int): String {
    return when (type) {
      ExerciseSessionRecord.EXERCISE_TYPE_BADMINTON -> "badminton"
      ExerciseSessionRecord.EXERCISE_TYPE_BASEBALL -> "baseball"
      ExerciseSessionRecord.EXERCISE_TYPE_BASKETBALL -> "basketball"
      ExerciseSessionRecord.EXERCISE_TYPE_BIKING -> "biking"
      ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "stationary_biking"
      ExerciseSessionRecord.EXERCISE_TYPE_BOOT_CAMP -> "boot_camp"
      ExerciseSessionRecord.EXERCISE_TYPE_BOXING -> "boxing"
      ExerciseSessionRecord.EXERCISE_TYPE_CALISTHENICS -> "calisthenics"
      ExerciseSessionRecord.EXERCISE_TYPE_CRICKET -> "cricket"
      ExerciseSessionRecord.EXERCISE_TYPE_DANCING -> "dancing"
      ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL -> "elliptical"
      ExerciseSessionRecord.EXERCISE_TYPE_EXERCISE_CLASS -> "exercise_class"
      ExerciseSessionRecord.EXERCISE_TYPE_FENCING -> "fencing"
      ExerciseSessionRecord.EXERCISE_TYPE_FOOTBALL_AMERICAN -> "american_football"
      ExerciseSessionRecord.EXERCISE_TYPE_FOOTBALL_AUSTRALIAN -> "australian_football"
      ExerciseSessionRecord.EXERCISE_TYPE_GOLF -> "golf"
      ExerciseSessionRecord.EXERCISE_TYPE_GUIDED_BREATHING -> "guided_breathing"
      ExerciseSessionRecord.EXERCISE_TYPE_GYMNASTICS -> "gymnastics"
      ExerciseSessionRecord.EXERCISE_TYPE_HANDBALL -> "handball"
      ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING -> "hiit"
      ExerciseSessionRecord.EXERCISE_TYPE_HIKING -> "hiking"
      ExerciseSessionRecord.EXERCISE_TYPE_ICE_HOCKEY -> "ice_hockey"
      ExerciseSessionRecord.EXERCISE_TYPE_ICE_SKATING -> "ice_skating"
      ExerciseSessionRecord.EXERCISE_TYPE_MARTIAL_ARTS -> "martial_arts"
      ExerciseSessionRecord.EXERCISE_TYPE_PADDLING -> "paddling"
      ExerciseSessionRecord.EXERCISE_TYPE_PARAGLIDING -> "paragliding"
      ExerciseSessionRecord.EXERCISE_TYPE_PILATES -> "pilates"
      ExerciseSessionRecord.EXERCISE_TYPE_RACQUETBALL -> "racquetball"
      ExerciseSessionRecord.EXERCISE_TYPE_ROCK_CLIMBING -> "rock_climbing"
      ExerciseSessionRecord.EXERCISE_TYPE_ROLLER_HOCKEY -> "roller_hockey"
      ExerciseSessionRecord.EXERCISE_TYPE_ROWING -> "rowing"
      ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE -> "rowing_machine"
      ExerciseSessionRecord.EXERCISE_TYPE_RUGBY -> "rugby"
      ExerciseSessionRecord.EXERCISE_TYPE_RUNNING -> "running"
      ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "treadmill_running"
      ExerciseSessionRecord.EXERCISE_TYPE_SAILING -> "sailing"
      ExerciseSessionRecord.EXERCISE_TYPE_SCUBA_DIVING -> "scuba_diving"
      ExerciseSessionRecord.EXERCISE_TYPE_SKIING -> "skiing"
      ExerciseSessionRecord.EXERCISE_TYPE_SNOWBOARDING -> "snowboarding"
      ExerciseSessionRecord.EXERCISE_TYPE_SNOWSHOEING -> "snowshoeing"
      ExerciseSessionRecord.EXERCISE_TYPE_SOCCER -> "soccer"
      ExerciseSessionRecord.EXERCISE_TYPE_SOFTBALL -> "softball"
      ExerciseSessionRecord.EXERCISE_TYPE_SQUASH -> "squash"
      ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING -> "stair_climbing"
      ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING_MACHINE -> "stair_machine"
      ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING -> "strength_training"
      ExerciseSessionRecord.EXERCISE_TYPE_STRETCHING -> "stretching"
      ExerciseSessionRecord.EXERCISE_TYPE_SURFING -> "surfing"
      ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER -> "open_water_swimming"
      ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL -> "pool_swimming"
      ExerciseSessionRecord.EXERCISE_TYPE_TABLE_TENNIS -> "table_tennis"
      ExerciseSessionRecord.EXERCISE_TYPE_TENNIS -> "tennis"
      ExerciseSessionRecord.EXERCISE_TYPE_VOLLEYBALL -> "volleyball"
      ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "walking"
      ExerciseSessionRecord.EXERCISE_TYPE_WATER_POLO -> "water_polo"
      ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING -> "weightlifting"
      ExerciseSessionRecord.EXERCISE_TYPE_WHEELCHAIR -> "wheelchair"
      ExerciseSessionRecord.EXERCISE_TYPE_YOGA -> "yoga"
      ExerciseSessionRecord.EXERCISE_TYPE_OTHER_WORKOUT -> "other_workout"
      else -> "exercise"
    }
  }

  private fun fallbackRecordId(prefix: String, startTime: String, endTime: String): String {
    return "$prefix-$startTime-$endTime"
  }
}
