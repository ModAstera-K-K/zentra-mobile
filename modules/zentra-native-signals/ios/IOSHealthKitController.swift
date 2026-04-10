import Foundation
import HealthKit

final class IOSHealthKitController {
  private let healthStore = HKHealthStore()
  private let formatter: ISO8601DateFormatter = {
    let isoFormatter = ISO8601DateFormatter()
    isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return isoFormatter
  }()

  private typealias HealthPermission = (key: String, type: HKObjectType)

  func getAvailability() -> String {
    HKHealthStore.isHealthDataAvailable() ? "available" : "unsupported"
  }

  func getGrantedPermissions() -> [String] {
    guard getAvailability() == "available" else {
      return []
    }

    return requiredPermissions().compactMap { permission in
      healthStore.authorizationStatus(for: permission.type) == .sharingAuthorized ? permission.key : nil
    }
  }

  func requestPermissions(resolve: @escaping ([String]) -> Void) {
    guard getAvailability() == "available" else {
      resolve([])
      return
    }

    let readTypes = Set(requiredPermissions().map(\.type))
    healthStore.requestAuthorization(toShare: Set<HKSampleType>(), read: readTypes) { success, _ in
      resolve(success ? self.getGrantedPermissions() : [])
    }
  }

  func readRecords(
    startIso: String,
    endIso: String,
    resolve: @escaping ([[String: Any?]]) -> Void,
  ) {
    guard
      getAvailability() == "available",
      let startDate = parseISODate(startIso),
      let endDate = parseISODate(endIso)
    else {
      resolve([])
      return
    }

    let predicate = HKQuery.predicateForSamples(
      withStart: startDate,
      end: endDate,
      options: [.strictStartDate, .strictEndDate],
    )
    let sortDescriptors = [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
    let group = DispatchGroup()
    let lock = NSLock()
    var records = [[String: Any?]]()

    func appendRecords(_ nextRecords: [[String: Any?]]) {
      lock.lock()
      records.append(contentsOf: nextRecords)
      lock.unlock()
    }

    if let stepsType = HKQuantityType.quantityType(forIdentifier: .stepCount) {
      group.enter()
      let query = HKSampleQuery(
        sampleType: stepsType,
        predicate: predicate,
        limit: HKObjectQueryNoLimit,
        sortDescriptors: sortDescriptors,
      ) { _, samples, _ in
        let serialized = (samples as? [HKQuantitySample] ?? []).map(self.serializeStepSample)
        appendRecords(serialized)
        group.leave()
      }
      healthStore.execute(query)
    }

    if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
      group.enter()
      let query = HKSampleQuery(
        sampleType: sleepType,
        predicate: predicate,
        limit: HKObjectQueryNoLimit,
        sortDescriptors: sortDescriptors,
      ) { _, samples, _ in
        let serialized = (samples as? [HKCategorySample] ?? []).compactMap(self.serializeSleepSample)
        appendRecords(serialized)
        group.leave()
      }
      healthStore.execute(query)
    }

    if let heartRateType = HKQuantityType.quantityType(forIdentifier: .heartRate) {
      group.enter()
      let query = HKSampleQuery(
        sampleType: heartRateType,
        predicate: predicate,
        limit: HKObjectQueryNoLimit,
        sortDescriptors: sortDescriptors,
      ) { _, samples, _ in
        let serialized = (samples as? [HKQuantitySample] ?? []).map(self.serializeHeartRateSample)
        appendRecords(serialized)
        group.leave()
      }
      healthStore.execute(query)
    }

    group.enter()
    let workoutsQuery = HKSampleQuery(
      sampleType: HKObjectType.workoutType(),
      predicate: predicate,
      limit: HKObjectQueryNoLimit,
      sortDescriptors: sortDescriptors,
    ) { _, samples, _ in
      let serialized = (samples as? [HKWorkout] ?? []).map(self.serializeWorkout)
      appendRecords(serialized)
      group.leave()
    }
    healthStore.execute(workoutsQuery)

    group.notify(queue: .main) {
      resolve(records.sorted { left, right in
        let leftStart = left["startTime"] as? String ?? ""
        let rightStart = right["startTime"] as? String ?? ""
        return leftStart < rightStart
      })
    }
  }

  private func requiredPermissions() -> [HealthPermission] {
    var permissions = [HealthPermission]()

    if let stepsType = HKQuantityType.quantityType(forIdentifier: .stepCount) {
      permissions.append(("ios.healthkit.read.steps", stepsType))
    }

    if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
      permissions.append(("ios.healthkit.read.sleep", sleepType))
    }

    if let heartRateType = HKQuantityType.quantityType(forIdentifier: .heartRate) {
      permissions.append(("ios.healthkit.read.heart_rate", heartRateType))
    }

    permissions.append(("ios.healthkit.read.exercise", HKObjectType.workoutType()))

    return permissions
  }

  private func parseISODate(_ value: String) -> Date? {
    formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
  }

  private func formatISODate(_ value: Date) -> String {
    formatter.string(from: value)
  }

  private func serializeStepSample(_ sample: HKQuantitySample) -> [String: Any?] {
    [
      "id": sample.uuid.uuidString,
      "recordType": "steps",
      "startTime": formatISODate(sample.startDate),
      "endTime": formatISODate(sample.endDate),
      "valueNumeric": sample.quantity.doubleValue(for: HKUnit.count()),
      "valueText": nil,
      "valueJson": nil,
      "unit": "count",
      "metadata": [:],
    ]
  }

  private func serializeSleepSample(_ sample: HKCategorySample) -> [String: Any?]? {
    let asleepValues = supportedSleepStageValues()

    guard asleepValues.contains(sample.value) else {
      return nil
    }

    let durationMinutes = sample.endDate.timeIntervalSince(sample.startDate) / 60

    return [
      "id": sample.uuid.uuidString,
      "recordType": "sleep",
      "startTime": formatISODate(sample.startDate),
      "endTime": formatISODate(sample.endDate),
      "valueNumeric": durationMinutes,
      "valueText": nil,
      "valueJson": nil,
      "unit": "minutes",
      "metadata": [
        "sleep_stage": sleepStageLabel(for: sample.value),
      ],
    ]
  }

  private func serializeHeartRateSample(_ sample: HKQuantitySample) -> [String: Any?] {
    [
      "id": sample.uuid.uuidString,
      "recordType": "heart_rate",
      "startTime": formatISODate(sample.startDate),
      "endTime": formatISODate(sample.endDate),
      "valueNumeric": sample.quantity.doubleValue(for: HKUnit(from: "count/min")),
      "valueText": nil,
      "valueJson": nil,
      "unit": "bpm",
      "metadata": [:],
    ]
  }

  private func serializeWorkout(_ workout: HKWorkout) -> [String: Any?] {
    [
      "id": workout.uuid.uuidString,
      "recordType": "exercise_session",
      "startTime": formatISODate(workout.startDate),
      "endTime": formatISODate(workout.endDate),
      "valueNumeric": workout.duration,
      "valueText": workoutActivityLabel(for: workout.workoutActivityType),
      "valueJson": nil,
      "unit": "seconds",
      "metadata": [:],
    ]
  }

  private func sleepStageLabel(for value: Int) -> String {
    if #available(iOS 16.0, *) {
      switch value {
      case HKCategoryValueSleepAnalysis.asleepCore.rawValue:
        return "core"
      case HKCategoryValueSleepAnalysis.asleepDeep.rawValue:
        return "deep"
      case HKCategoryValueSleepAnalysis.asleepREM.rawValue:
        return "rem"
      case HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue:
        return "asleep_unspecified"
      case HKCategoryValueSleepAnalysis.asleep.rawValue:
        return "asleep"
      default:
        return "unknown"
      }
    }

    return value == HKCategoryValueSleepAnalysis.asleep.rawValue ? "asleep" : "unknown"
  }

  private func supportedSleepStageValues() -> Set<Int> {
    var values: Set<Int> = [HKCategoryValueSleepAnalysis.asleep.rawValue]

    if #available(iOS 16.0, *) {
      values.insert(HKCategoryValueSleepAnalysis.asleepCore.rawValue)
      values.insert(HKCategoryValueSleepAnalysis.asleepDeep.rawValue)
      values.insert(HKCategoryValueSleepAnalysis.asleepREM.rawValue)
      values.insert(HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue)
    }

    return values
  }

  private func workoutActivityLabel(for value: HKWorkoutActivityType) -> String {
    switch value {
    case .running:
      return "running"
    case .walking:
      return "walking"
    case .cycling:
      return "cycling"
    case .hiking:
      return "hiking"
    case .traditionalStrengthTraining:
      return "strength_training"
    case .highIntensityIntervalTraining:
      return "hiit"
    case .yoga:
      return "yoga"
    default:
      return "other"
    }
  }
}
