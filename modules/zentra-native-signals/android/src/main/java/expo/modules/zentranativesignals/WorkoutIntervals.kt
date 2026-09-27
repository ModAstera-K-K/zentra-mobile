package expo.modules.zentranativesignals

import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.ExerciseSegment
import org.json.JSONArray
import java.time.Duration

internal fun workoutIntervals(record: ExerciseSessionRecord): List<Pair<java.time.Instant, java.time.Instant>> {
  val pauses = record.segments.filter { it.segmentType == ExerciseSegment.EXERCISE_SEGMENT_TYPE_REST || it.segmentType == ExerciseSegment.EXERCISE_SEGMENT_TYPE_PAUSE }.sortedBy { it.startTime }
  var cursor = record.startTime
  val active = mutableListOf<Pair<java.time.Instant, java.time.Instant>>()
  for (pause in pauses) {
    val start = maxOf(record.startTime, pause.startTime)
    val end = minOf(record.endTime, pause.endTime)
    if (start > cursor) active.add(cursor to start)
    cursor = maxOf(cursor, end)
  }
  if (cursor < record.endTime) active.add(cursor to record.endTime)
  return active
}
internal fun serializeWorkoutIntervals(record: ExerciseSessionRecord): String = JSONArray().also { json ->
  workoutIntervals(record).forEach { (start, end) -> json.put(JSONArray().put(start.toString()).put(end.toString())) }
}.toString()
internal fun workoutDurationMinutes(record: ExerciseSessionRecord): Double = workoutIntervals(record).sumOf { (start, end) -> Duration.between(start, end).toMillis() / 60000.0 }
