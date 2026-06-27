import CoreMotion
import Foundation

final class IOSActivityRecognitionController {
  private let activityManager = CMMotionActivityManager()
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
    guard
      let activity,
      let nextActivityType = IOSActivityTransitionHelpers.dominantActivityType(
        for: activity
      )
    else {
      return
    }

    let timestamp = IOSActivityTransitionHelpers.formatISODate(activity.startDate)
    let confidence = IOSActivityTransitionHelpers.confidenceValue(for: activity.confidence)

    if let previousActivityType = lastActivityType, previousActivityType != nextActivityType {
      DispatchQueue.main.async {
        self.emitTransition(
          IOSActivityTransitionHelpers.liveTransitionPayload(
            activityType: previousActivityType,
            transitionType: "exit",
            confidence: confidence,
            timestamp: timestamp
          )
        )
      }
    }

    if lastActivityType != nextActivityType {
      DispatchQueue.main.async {
        self.emitTransition(
          IOSActivityTransitionHelpers.liveTransitionPayload(
            activityType: nextActivityType,
            transitionType: "enter",
            confidence: confidence,
            timestamp: timestamp
          )
        )
      }
      lastActivityType = nextActivityType
    }
  }

  func readBufferedTransitions(
    cursorExclusive: Int64?,
    limit: Int,
    resolve: @escaping ([[String: Any]]) -> Void
  ) {
    guard getPermissionStatus() == "granted" else {
      resolve([])
      return
    }

    let endDate = Date()
    let startDate = IOSActivityTransitionHelpers.historyStartDate(
      cursorExclusive: cursorExclusive,
      endingAt: endDate
    )

    activityManager.queryActivityStarting(from: startDate, to: endDate, to: queue) { activities, _ in
      resolve(
        IOSActivityTransitionHelpers.buildHistoricalTransitions(
          from: activities ?? [],
          cursorExclusive: cursorExclusive,
          limit: limit
        )
      )
    }
  }
}
