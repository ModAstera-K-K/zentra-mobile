import CoreMotion
import Foundation

final class IOSActivityRecognitionController {
  private let activityManager = CMMotionActivityManager()
  private let formatter = ISO8601DateFormatter()
  private let queue: OperationQueue = {
    let operationQueue = OperationQueue()
    operationQueue.name = "ZentraActivityRecognitionQueue"
    return operationQueue
  }()

  private var lastActivityType: String?
  private let emitTransition: ([String: Any]) -> Void

  init(emitTransition: @escaping ([String: Any]) -> Void) {
    self.emitTransition = emitTransition
  }

  func getPermissionStatus() -> String {
    guard CMMotionActivityManager.isActivityAvailable() else {
      return "unsupported"
    }

    switch CMMotionActivityManager.authorizationStatus() {
    case .authorized:
      return "granted"
    case .restricted, .denied:
      return "blocked"
    case .notDetermined:
      return "not_requested"
    @unknown default:
      return "not_requested"
    }
  }

  func requestPermission(resolve: @escaping (String) -> Void) {
    let currentStatus = getPermissionStatus()

    guard currentStatus == "not_requested" else {
      resolve(currentStatus)
      return
    }

    let endDate = Date()
    let startDate = endDate.addingTimeInterval(-300)

    activityManager.queryActivityStarting(from: startDate, to: endDate, to: queue) { _, _ in
      resolve(self.getPermissionStatus())
    }
  }

  func startUpdates() -> Bool {
    guard getPermissionStatus() == "granted" else {
      return false
    }

    activityManager.startActivityUpdates(to: queue) { activity in
      self.handle(activity)
    }

    return true
  }

  func stopUpdates() {
    activityManager.stopActivityUpdates()
    lastActivityType = nil
  }

  private func handle(_ activity: CMMotionActivity?) {
    guard let activity, let nextActivityType = dominantActivityType(for: activity) else {
      return
    }

    let timestamp = formatter.string(from: activity.startDate)
    let confidence = confidenceValue(for: activity.confidence)

    if let previousActivityType = lastActivityType, previousActivityType != nextActivityType {
      DispatchQueue.main.async {
        self.emitTransition([
          "id": self.transitionId(
            activityType: previousActivityType,
            transitionType: "exit",
            timestamp: timestamp
          ),
          "activityType": previousActivityType,
          "transitionType": "exit",
          "confidence": confidence,
          "timestamp": timestamp,
        ])
      }
    }

    if lastActivityType != nextActivityType {
      DispatchQueue.main.async {
        self.emitTransition([
          "id": self.transitionId(
            activityType: nextActivityType,
            transitionType: "enter",
            timestamp: timestamp
          ),
          "activityType": nextActivityType,
          "transitionType": "enter",
          "confidence": confidence,
          "timestamp": timestamp,
        ])
      }
      lastActivityType = nextActivityType
    }
  }

  private func dominantActivityType(for activity: CMMotionActivity) -> String? {
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

  private func confidenceValue(for confidence: CMMotionActivityConfidence) -> Double {
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

  private func transitionId(
    activityType: String,
    transitionType: String,
    timestamp: String
  ) -> String {
    return ["activity", activityType, transitionType, timestamp].joined(separator: "-")
  }
}
