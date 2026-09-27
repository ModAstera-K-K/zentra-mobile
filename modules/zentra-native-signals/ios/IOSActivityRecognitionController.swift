import CoreMotion
import Foundation

final class IOSActivityRecognitionController {
  private let activityManager = CMMotionActivityManager()
  private let queue: OperationQueue = {
    let operationQueue = OperationQueue()
    operationQueue.name = "ZentraActivityRecognitionQueue"
    operationQueue.maxConcurrentOperationCount = 1
    return operationQueue
  }()

  private let state = DispatchQueue(label: "ZentraActivityState")
  private var previous: IOSActivitySample?
  private var generation = 0
  private let history = IOSActivityHistoryReader()
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

    let expected = state.sync { () -> Int in
      generation += 1
      previous = nil
      return generation
    }
    activityManager.startActivityUpdates(to: queue) { activity in
      guard let activity else { return }
      self.state.async { self.handle(IOSActivitySample(activity), expected: expected) }
    }
    return true
  }

  func stopUpdates() {
    activityManager.stopActivityUpdates()
    state.sync { generation += 1; previous = nil }
    history.cancel()
  }

  func cancelHistory() { history.cancel() }

  func readHistory(start: String, end: String, cursor: String?, limit: Int,
                   completion: @escaping (Result<[String: Any], Error>) -> Void) {
    guard getPermissionStatus() == "granted" else {
      completion(.failure(IOSActivityHistoryPage.error("Motion permission not granted"))); return
    }
    history.read(start: start, end: end, cursor: cursor, limit: limit, completion: completion)
  }

  private func handle(_ sample: IOSActivitySample, expected: Int) {
    guard generation == expected else { return }
    let transitions = IOSActivityTransitionHelpers.transitions(previous: previous, next: sample, at: sample.start)
    if IOSActivityTransitionHelpers.changed(previous, sample) { previous = sample }
    for transition in transitions {
      let payload = transition.payload(delivery: "live")
      DispatchQueue.main.async {
        guard self.state.sync(execute: { self.generation == expected }) else { return }
        self.emitTransition(payload)
      }
    }
  }
}
