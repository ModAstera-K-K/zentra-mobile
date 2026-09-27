import ExpoModulesCore

public class ZentraNativeSignalsModule: Module {
  private lazy var activityController = IOSActivityRecognitionController { payload in
    self.sendEvent("onActivityTransition", payload)
  }
  private let healthKitController = IOSHealthKitController()

  public func definition() -> ModuleDefinition {
    Name("ZentraNativeSignals")

    Events("onActivityTransition")

    OnDestroy {
      self.activityController.stopUpdates()
    }

    AsyncFunction("getActivityRecognitionPermissionStatusAsync") {
      self.activityController.getPermissionStatus()
    }

    AsyncFunction("requestActivityRecognitionPermissionAsync") { (promise: Promise) in
      self.activityController.requestPermission { status in
        promise.resolve(status)
      }
    }

    AsyncFunction("startActivityRecognitionUpdatesAsync") {
      self.activityController.startUpdates()
    }

    AsyncFunction("stopActivityRecognitionUpdatesAsync") {
      self.activityController.stopUpdates()
    }

    AsyncFunction("getHealthConnectAvailabilityAsync") {
      self.healthKitController.getAvailability()
    }

    AsyncFunction("getUsageAccessPermissionStatusAsync") {
      "unsupported"
    }

    AsyncFunction("openUsageAccessSettingsAsync") {
      false
    }

    AsyncFunction("readUsageEventsAsync") { (_: String, _: String) in
      [[String: Any?]]()
    }

    AsyncFunction("getGrantedHealthConnectPermissionsAsync") {
      self.healthKitController.getGrantedPermissions()
    }

    AsyncFunction("openHealthConnectPermissionRequestAsync") {
      false
    }

    AsyncFunction("openHealthConnectSettingsAsync") {
      false
    }

    AsyncFunction("requestHealthConnectPermissionsAsync") { (promise: Promise) in
      self.healthKitController.requestPermissions { grantedPermissions in
        promise.resolve(grantedPermissions)
      }
    }

    AsyncFunction("readHealthSyncPageAsync") { (type: String, start: String, end: String, cursor: String?, promise: Promise) in
      IOSHealthSyncReader(controller: self.healthKitController).page(type: type, start: start, end: end, cursor: cursor) { result in
        switch result { case .success(let value): promise.resolve(value); case .failure(let error): promise.reject("HEALTH_READ", error.localizedDescription) }
      }
    }
    AsyncFunction("readHealthStepsAsync") { (start: String, end: String, promise: Promise) in
      IOSHealthSyncReader(controller: self.healthKitController).steps(start: start, end: end) { result in
        switch result { case .success(let value): promise.resolve(value); case .failure(let error): promise.reject("HEALTH_STATISTICS", error.localizedDescription) }
      }
    }

    AsyncFunction("readHealthStepTimingAsync") { (start: String, end: String, promise: Promise) in
      IOSHealthSyncReader(controller: self.healthKitController).steps(start: start, end: end, minutes: 1) { result in
        switch result { case .success(let value): promise.resolve(value); case .failure(let error): promise.reject("HEALTH_STATISTICS", error.localizedDescription) }
      }
    }

    AsyncFunction("readHealthConnectRecordsAsync") { (startIso: String, endIso: String, promise: Promise) in
      self.healthKitController.readRecords(startIso: startIso, endIso: endIso) { records in
        promise.resolve(records)
      }
    }
  }
}
