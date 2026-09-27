import CoreMotion
import Foundation

final class IOSActivityHistoryReader {
  private let manager = CMMotionActivityManager()
  private let queue: OperationQueue = {
    let value = OperationQueue()
    value.name = "ZentraActivityHistoryQueue"
    value.qualityOfService = .utility
    value.maxConcurrentOperationCount = 1
    return value
  }()
  private var cached: IOSActivityHistoryPage?
  private var generation = 0
  private var querying = false

  func cancel() {
    queue.addOperation { self.generation += 1; self.cached = nil }
  }

  func read(start: String, end: String, cursor: String?, limit: Int,
            completion: @escaping (Result<[String: Any], Error>) -> Void) {
    queue.addOperation {
      do {
        guard CMMotionActivityManager.authorizationStatus() == .authorized else {
          throw IOSActivityHistoryPage.error("Motion permission not granted")
        }
        let decoded = try IOSActivityHistoryCursor.decode(cursor, start: start, end: end)
        if let page = self.cached, page.requestedStart == start, page.requestedEnd == end {
          self.deliver(page, cursor: decoded, limit: limit, completion: completion)
          return
        }
        guard !self.querying else { throw IOSActivityHistoryPage.error("Activity history query already running; retry") }
        let (first, last, floor) = try IOSActivityHistoryPage.bounds(start: start, end: end, now: Date())
        if first >= last {
          let page = IOSActivityHistoryPage(requestedStart: start, requestedEnd: end,
            start: first, end: last, availableStart: floor, transitions: [])
          self.deliver(page, cursor: decoded, limit: limit, completion: completion)
          return
        }
        self.query(start: start, end: end, first: first, last: last, floor: floor,
          cursor: decoded, limit: limit, completion: completion)
      } catch { completion(.failure(error)) }
    }
  }

  private func query(start: String, end: String, first: Date, last: Date, floor: Date,
                     cursor: IOSActivityHistoryCursor?, limit: Int,
                     completion: @escaping (Result<[String: Any], Error>) -> Void) {
    let expected = generation
    querying = true
    manager.queryActivityStarting(from: first, to: last, to: queue) { activities, error in
      self.querying = false
      guard expected == self.generation else {
        completion(.failure(IOSActivityHistoryPage.error("Activity import cancelled"))); return
      }
      if let error { completion(.failure(error)); return }
      guard let activities else {
        completion(.failure(IOSActivityHistoryPage.error("Activity query returned no result"))); return
      }
      let page = IOSActivityHistoryPage(requestedStart: start, requestedEnd: end,
        start: first, end: last, availableStart: floor,
        transitions: IOSActivityTransitionHelpers.history(activities.map { IOSActivitySample($0) }, start: first, end: last))
      self.deliver(page, cursor: cursor, limit: limit, completion: completion)
    }
  }

  private func deliver(_ page: IOSActivityHistoryPage, cursor: IOSActivityHistoryCursor?, limit: Int,
                        completion: @escaping (Result<[String: Any], Error>) -> Void) {
    do {
      let result = try page.payload(after: cursor, limit: limit)
      cached = result["hasMore"] as? Bool == true ? page : nil
      completion(.success(result))
    } catch { completion(.failure(error)) }
  }
}
