import ExpoModulesCore

public class ZentraNativeSignalsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ZentraNativeSignals")

    Events("onActivityTransition")

    AsyncFunction("getActivityRecognitionPermissionStatusAsync") {
      return "unsupported"
    }

    AsyncFunction("requestActivityRecognitionPermissionAsync") {
      return "unsupported"
    }

    AsyncFunction("startActivityRecognitionUpdatesAsync") {
      return false
    }

    AsyncFunction("stopActivityRecognitionUpdatesAsync") { }

    AsyncFunction("getHealthConnectAvailabilityAsync") {
      return "unsupported"
    }

    AsyncFunction("getUsageAccessPermissionStatusAsync") {
      return "unsupported"
    }

    AsyncFunction("openUsageAccessSettingsAsync") {
      return false
    }

    AsyncFunction("readUsageEventsAsync") { (_: String, _: String) in
      return [[String: Any]]()
    }

    AsyncFunction("getGrantedHealthConnectPermissionsAsync") {
      return [String]()
    }

    AsyncFunction("requestHealthConnectPermissionsAsync") {
      return [String]()
    }

    AsyncFunction("readHealthConnectRecordsAsync") { (_: String, _: String) in
      return [[String: Any]]()
    }
  }
}
