import Foundation
import HealthKit

final class IOSHealthSyncReader {
  private let controller: IOSHealthKitController
  init(controller: IOSHealthKitController) { self.controller = controller }

  func page(type: String, start: String, end: String, cursor: String?, completion: @escaping (Result<[String: Any], Error>) -> Void) {
    guard let sampleType = sampleType(type), let startDate = controller.parseISODate(start) else {
      completion(.failure(NSError(domain: "HealthImport", code: 1, userInfo: [NSLocalizedDescriptionKey: "Unsupported record type or date"])))
      return
    }
    var anchor: HKQueryAnchor?
    if let cursor = cursor {
      guard let data = Data(base64Encoded: cursor) else { completion(.success(["records": [], "deletedIds": [], "hasMore": true, "reset": true])); return }
      do { anchor = try NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data) }
      catch { completion(.success(["records": [], "deletedIds": [], "hasMore": true, "reset": true])); return }
    }
    // Keep this lower bound fixed across anchored reads; no moving upper bound.
    let predicate = HKQuery.predicateForSamples(withStart: startDate, end: nil, options: [])
    let query = HKAnchoredObjectQuery(type: sampleType, predicate: predicate, anchor: anchor, limit: 200) { _, samples, deleted, nextAnchor, error in
      if let error = error { completion(.failure(error)); return }
      do {
        var result: [String: Any] = [
          "records": (samples ?? []).compactMap { self.serialize($0) },
          "deletedIds": (deleted ?? []).map { $0.uuid.uuidString },
          "hasMore": (samples?.count ?? 0) + (deleted?.count ?? 0) >= 200
        ]
        if let nextAnchor = nextAnchor {
          result["cursor"] = try NSKeyedArchiver.archivedData(withRootObject: nextAnchor, requiringSecureCoding: true).base64EncodedString()
        }
        completion(.success(result))
      } catch { completion(.failure(error)) }
    }
    controller.healthStore.execute(query)
  }

  func steps(start: String, end: String, minutes: Int = 60, completion: @escaping (Result<[[String: Any]], Error>) -> Void) {
    guard let type = HKQuantityType.quantityType(forIdentifier: .stepCount), let startDate = controller.parseISODate(start), let endDate = controller.parseISODate(end) else {
      completion(.failure(NSError(domain: "HealthImport", code: 2))); return
    }
    let query = HKStatisticsCollectionQuery(quantityType: type, quantitySamplePredicate: HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: []), options: .cumulativeSum, anchorDate: startDate, intervalComponents: DateComponents(minute: minutes))
    query.initialResultsHandler = { _, collection, error in
      if let error = error { completion(.failure(error)); return }
      var records = [[String: Any]]()
      collection?.enumerateStatistics(from: startDate, to: endDate) { statistics, _ in
        guard let sum = statistics.sumQuantity() else { return }
        let startISO = self.controller.formatISODate(statistics.startDate)
        records.append(["id": "statistics-\(startISO)", "recordType": "steps",
          "startTime": startISO, "endTime": self.controller.formatISODate(min(statistics.endDate, endDate)),
          "valueNumeric": sum.doubleValue(for: .count()), "unit": "count",
          "metadata": ["platform_aggregate": true, "source_app": "healthkit_statistics"]])
      }
      completion(.success(records))
    }
    controller.healthStore.execute(query)
  }

  private func sampleType(_ type: String) -> HKSampleType? {
    switch type {
    case "steps": return HKQuantityType.quantityType(forIdentifier: .stepCount)
    case "sleep": return HKObjectType.categoryType(forIdentifier: .sleepAnalysis)
    case "heart_rate": return HKQuantityType.quantityType(forIdentifier: .heartRate)
    case "exercise_session": return HKObjectType.workoutType()
    default: return nil
    }
  }

  private func serialize(_ sample: HKSample) -> [String: Any?]? {
    if let sample = sample as? HKWorkout { return controller.serializeWorkout(sample) }
    if let sample = sample as? HKCategorySample { return controller.serializeSleepSample(sample) }
    guard let sample = sample as? HKQuantitySample else { return nil }
    return sample.quantityType.identifier == HKQuantityTypeIdentifier.stepCount.rawValue
      ? controller.serializeStepSample(sample) : controller.serializeHeartRateSample(sample)
  }
}
