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

    AsyncFunction("readHealthConnectRecordsAsync") { (startIso: String, endIso: String, promise: Promise) in
      self.healthKitController.readRecords(startIso: startIso, endIso: endIso) { records in
        promise.resolve(records)
      }
    }
  }
}
