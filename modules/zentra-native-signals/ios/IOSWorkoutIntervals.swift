import HealthKit

/// Only emit exact intervals when recorded pause/resume boundaries exist.
func workoutActiveIntervals(_ workout: HKWorkout, format: (Date) -> String) -> String? {
  let events = (workout.workoutEvents ?? []).filter {
    $0.type == .pause || $0.type == .resume || $0.type == .motionPaused || $0.type == .motionResumed
  }.sorted { $0.dateInterval.start < $1.dateInterval.start }
  guard !events.isEmpty else { return nil }
  var start: Date? = workout.startDate
  var intervals = [[String]]()
  for event in events {
    let time = min(workout.endDate, max(workout.startDate, event.dateInterval.start))
    if event.type == .pause || event.type == .motionPaused {
      if let activeStart = start, time > activeStart { intervals.append([format(activeStart), format(time)]) }
      start = nil
    } else if start == nil { start = time }
  }
  if let activeStart = start, workout.endDate > activeStart { intervals.append([format(activeStart), format(workout.endDate)]) }
  guard let data = try? JSONSerialization.data(withJSONObject: intervals) else { return nil }
  return String(data: data, encoding: .utf8)
}
