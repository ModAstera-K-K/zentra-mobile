import CoreMotion
import Foundation

enum IOSActivityTransitionHelpers {
  private static let cursorScale: Int64 = 10
  private static let historyOverlapSeconds: TimeInterval = 600

  private static let formatter: ISO8601DateFormatter = {
    let isoFormatter = ISO8601DateFormatter()
    isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return isoFormatter
  }()

  static func defaultHistoryStartDate(endingAt endDate: Date) -> Date {
    Calendar.current.startOfDay(for: endDate)
  }

  static func historyStartDate(cursorExclusive: Int64?, endingAt endDate: Date) -> Date {
    guard let cursorExclusive else {
      return defaultHistoryStartDate(endingAt: endDate)
    }

    return date(fromCursor: cursorExclusive).addingTimeInterval(-historyOverlapSeconds)
  }

  static func dominantActivityType(for activity: CMMotionActivity) -> String? {
    if activity.walking {
      return "walking"
    }

    if activity.running {
      return "running"
    }

    if activity.cycling {
      return "on_bicycle"
    }

    if activity.automotive {
      return "in_vehicle"
    }

    if activity.stationary {
      return "still"
    }

    return nil
  }

  static func confidenceValue(for confidence: CMMotionActivityConfidence) -> Double {
    switch confidence {
    case .low:
      return 0.35
    case .medium:
      return 0.65
    case .high:
      return 0.95
    @unknown default:
      return 0.5
    }
  }

  static func transitionId(
    activityType: String,
    transitionType: String,
    timestamp: String
  ) -> String {
    ["activity", activityType, transitionType, timestamp].joined(separator: "-")
  }

  static func liveTransitionPayload(
    activityType: String,
    transitionType: String,
    confidence: Double,
    timestamp: String
  ) -> [String: Any] {
    [
      "id": transitionId(
        activityType: activityType,
        transitionType: transitionType,
        timestamp: timestamp
      ),
      "activityType": activityType,
      "transitionType": transitionType,
      "confidence": confidence,
      "timestamp": timestamp,
    ]
  }

  static func buildHistoricalTransitions(
    from activities: [CMMotionActivity],
    cursorExclusive: Int64?,
    limit: Int
  ) -> [[String: Any]] {
    let normalizedLimit = max(1, limit)
    var previousActivityType: String?
    var transitions = [[String: Any]]()

    for activity in activities.sorted(by: { $0.startDate < $1.startDate }) {
      guard let nextActivityType = dominantActivityType(for: activity) else {
        continue
      }

      if previousActivityType == nextActivityType {
        continue
      }

      let confidence = confidenceValue(for: activity.confidence)
      let timestamp = formatISODate(activity.startDate)

      if let previousActivityType {
        transitions.append(
          historicalTransitionPayload(
            activityType: previousActivityType,
            transitionType: "exit",
            confidence: confidence,
            timestamp: timestamp,
            cursor: cursor(for: activity.startDate, transitionOrder: 0)
          )
        )
      }

      transitions.append(
        historicalTransitionPayload(
          activityType: nextActivityType,
          transitionType: "enter",
          confidence: confidence,
          timestamp: timestamp,
          cursor: cursor(for: activity.startDate, transitionOrder: 1)
        )
      )

      previousActivityType = nextActivityType
    }

    return transitions
      .filter { payload in
        guard
          let cursorExclusive,
          let cursor = payload["cursor"] as? Int64
        else {
          return true
        }

        return cursor > cursorExclusive
      }
      .prefix(normalizedLimit)
      .map { $0 }
  }

  static func formatISODate(_ value: Date) -> String {
    formatter.string(from: value)
  }

  private static func historicalTransitionPayload(
    activityType: String,
    transitionType: String,
    confidence: Double,
    timestamp: String,
    cursor: Int64
  ) -> [String: Any] {
    var payload = liveTransitionPayload(
      activityType: activityType,
      transitionType: transitionType,
      confidence: confidence,
      timestamp: timestamp
    )
    payload["cursor"] = cursor
    return payload
  }

  private static func cursor(for timestamp: Date, transitionOrder: Int64) -> Int64 {
    let millis = Int64((timestamp.timeIntervalSince1970 * 1000).rounded(.down))
    return millis * cursorScale + transitionOrder
  }

  private static func date(fromCursor cursor: Int64) -> Date {
    Date(timeIntervalSince1970: TimeInterval(cursor / cursorScale) / 1000)
  }
}
