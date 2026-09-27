import Foundation

struct IOSActivitySample {
  let start: Date
  let kind: String
  let confidence: Double
}

struct IOSActivityTransition {
  let sample: IOSActivitySample
  let transition: String
  let timestamp: Date
  let boundary: Bool

  var key: String {
    "\(IOSActivityTransitionHelpers.format(timestamp))|\(transition == "exit" ? 0 : 1)|\(sample.kind)"
  }

  func payload(delivery: String) -> [String: Any] {
    let stamp = IOSActivityTransitionHelpers.format(timestamp)
    var value: [String: Any] = [
      "id": "activity-\(sample.kind)-\(transition)-\(stamp)",
      "activityType": sample.kind, "transitionType": transition,
      "timestamp": stamp, "confidence": sample.confidence,
      "platform": "ios", "streamId": "ios:core_motion", "delivery": delivery,
    ]
    if boundary {
      value["boundaryContext"] = true
      value["originalTimestamp"] = IOSActivityTransitionHelpers.format(sample.start)
    }
    return value
  }
}

enum IOSActivityTransitionHelpers {
  private static let formatter: ISO8601DateFormatter = {
    let value = ISO8601DateFormatter()
    value.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return value
  }()

  static func format(_ date: Date) -> String { formatter.string(from: date) }

  static func parse(_ value: String) -> Date? {
    formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
  }

  static func kind(walking: Bool, running: Bool, cycling: Bool,
                   automotive: Bool, stationary: Bool, unknown: Bool) -> String {
    let physical = [(walking, "walking"), (running, "running"), (cycling, "on_bicycle")]
      .filter { $0.0 }.map { $0.1 }
    if unknown || physical.count > 1 || (!physical.isEmpty && (automotive || stationary)) {
      return "unknown"
    }
    if let kind = physical.first { return kind }
    // A stopped vehicle can be both stationary and automotive.
    if automotive { return "in_vehicle" }
    return stationary ? "still" : "unknown"
  }

  static func changed(_ previous: IOSActivitySample?, _ next: IOSActivitySample) -> Bool {
    guard let previous else { return true }
    return previous.kind != next.kind || (previous.confidence >= 0.65) != (next.confidence >= 0.65)
  }

  static func transitions(previous: IOSActivitySample?, next: IOSActivitySample,
                          at timestamp: Date, boundary: Bool = false) -> [IOSActivityTransition] {
    guard changed(previous, next) else { return [] }
    var result = [IOSActivityTransition]()
    if let previous {
      result.append(IOSActivityTransition(sample: previous, transition: "exit", timestamp: timestamp, boundary: false))
    }
    result.append(IOSActivityTransition(sample: next, transition: "enter", timestamp: timestamp, boundary: boundary))
    return result
  }

  static func normalized(_ input: [IOSActivitySample]) -> [IOSActivitySample] {
    var result = [IOSActivitySample]()
    for sample in input.sorted(by: { $0.start < $1.start }) {
      if let last = result.last, format(last.start) == format(sample.start) {
        result.removeLast()
        result.append(IOSActivitySample(start: last.start,
          kind: last.kind == sample.kind ? sample.kind : "unknown",
          confidence: min(last.confidence, sample.confidence)))
      } else { result.append(sample) }
    }
    return result
  }

  static func history(_ samples: [IOSActivitySample], start: Date, end: Date) -> [IOSActivityTransition] {
    let sorted = normalized(samples).filter { $0.start < end }
    let context = sorted.last { $0.start < start }
    let bounded = (context.map { [$0] } ?? []) + sorted.filter { $0.start >= start }
    var previous: IOSActivitySample?
    var result = [IOSActivityTransition]()
    for sample in bounded {
      result += transitions(previous: previous, next: sample,
        at: max(sample.start, start), boundary: sample.start < start)
      if changed(previous, sample) { previous = sample }
    }
    // A successful query is not evidence of an exit at its end (especially now).
    // Samples are ordered, and each boundary emits exit before enter.
    return result
  }
}
