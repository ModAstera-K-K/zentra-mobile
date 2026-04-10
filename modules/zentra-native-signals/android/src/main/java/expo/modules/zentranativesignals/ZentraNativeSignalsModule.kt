package expo.modules.zentranativesignals

import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ZentraNativeSignalsModule : Module() {
  private lateinit var activityPermissionLauncher: AppContextActivityResultLauncher<ActivityPermissionRequest, Boolean>
  private lateinit var healthConnectPermissionsLauncher: AppContextActivityResultLauncher<HealthConnectPermissionRequest, ArrayList<String>>

  override fun definition() = ModuleDefinition {
    Name("ZentraNativeSignals")

    Events("onActivityTransition")

    OnCreate {
      ZentraNativeSignalsEventRegistry.setActivityTransitionListener { payload ->
        sendEvent("onActivityTransition", mapOf(
          "activityType" to payload.activityType,
          "transitionType" to payload.transitionType,
          "confidence" to payload.confidence,
          "timestamp" to payload.timestamp,
        ))
      }
    }

    RegisterActivityContracts {
      activityPermissionLauncher = registerForActivityResult(ActivityPermissionContract())
      healthConnectPermissionsLauncher = registerForActivityResult(HealthConnectPermissionContract())
    }

    OnDestroy {
      ZentraNativeSignalsEventRegistry.setActivityTransitionListener(null)
      getActivityRecognitionController()?.stopUpdates()
    }

    AsyncFunction("getActivityRecognitionPermissionStatusAsync") {
      getActivityRecognitionController()?.getPermissionStatus() ?: "unsupported"
    }

    AsyncFunction("requestActivityRecognitionPermissionAsync") Coroutine {
      val controller = getActivityRecognitionController() ?: return@Coroutine "unsupported"
      controller.markPermissionRequested()
      val granted = activityPermissionLauncher.launch(
        ActivityPermissionRequest(android.Manifest.permission.ACTIVITY_RECOGNITION),
      )
      if (granted) "granted" else controller.getPermissionStatus()
    }

    AsyncFunction("startActivityRecognitionUpdatesAsync") {
      val controller = getActivityRecognitionController() ?: return@AsyncFunction false
      if (controller.getPermissionStatus() != "granted") {
        return@AsyncFunction false
      }

      controller.startUpdates()
    }

    AsyncFunction("stopActivityRecognitionUpdatesAsync") {
      getActivityRecognitionController()?.stopUpdates()
    }

    AsyncFunction("getHealthConnectAvailabilityAsync") {
      getHealthConnectController()?.getAvailability() ?: "unsupported"
    }

    AsyncFunction("getGrantedHealthConnectPermissionsAsync") Coroutine {
      getHealthConnectController()?.getGrantedPermissions() ?: arrayListOf()
    }

    AsyncFunction("requestHealthConnectPermissionsAsync") Coroutine {
      val controller = getHealthConnectController() ?: return@Coroutine arrayListOf<String>()
      if (controller.getAvailability() != "available") {
        return@Coroutine arrayListOf<String>()
      }

      healthConnectPermissionsLauncher.launch(HealthConnectPermissionRequest(controller.requiredPermissions()))
    }

    AsyncFunction("readHealthConnectRecordsAsync") Coroutine { startIso: String, endIso: String ->
      getHealthConnectController()?.readRecords(startIso, endIso) ?: emptyList<Map<String, Any?>>()
    }
  }

  private fun getActivityRecognitionController(): ActivityRecognitionController? {
    val context = appContext.reactContext ?: return null
    return ActivityRecognitionController(context, appContext)
  }

  private fun getHealthConnectController(): HealthConnectController? {
    val context = appContext.reactContext ?: return null
    return HealthConnectController(context)
  }
}
