package expo.modules.zentranativesignals

import expo.modules.kotlin.Promise
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.launch

class ZentraNativeSignalsModule : Module() {
  private lateinit var activityPermissionLauncher: AppContextActivityResultLauncher<ActivityPermissionRequest, Boolean>
  private lateinit var healthConnectPermissionsLauncher: AppContextActivityResultLauncher<HealthConnectPermissionRequest, ArrayList<String>>

  override fun definition() = ModuleDefinition {
    Name("ZentraNativeSignals")

    Events("onActivityTransition")

    OnCreate {
      ZentraNativeSignalsEventRegistry.setActivityTransitionListener { payload ->
        sendEvent("onActivityTransition", mapOf(
          "id" to payload.id,
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
      ZentraNativeSignalsEventRegistry.resetActivityState()
      getActivityRecognitionController()?.stopUpdates()
    }

    AsyncFunction("getActivityRecognitionPermissionStatusAsync") {
      getActivityRecognitionController()?.getPermissionStatus() ?: "unsupported"
    }

    AsyncFunction("requestActivityRecognitionPermissionAsync") { promise: Promise ->
      val controller = getActivityRecognitionController()
      if (controller == null) {
        promise.resolve("unsupported")
        return@AsyncFunction
      }

      controller.markPermissionRequested()
      appContext.mainQueue.launch {
        try {
          activityPermissionLauncher.launch(
            ActivityPermissionRequest(android.Manifest.permission.ACTIVITY_RECOGNITION),
          ) { granted ->
            promise.resolve(if (granted) "granted" else controller.getPermissionStatus())
          }
        } catch (error: Throwable) {
          promise.reject("ERR_ACTIVITY_PERMISSION", error.message, error)
        }
      }
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

    AsyncFunction("readBufferedActivityTransitionsAsync") {
      val context = getContext() ?: return@AsyncFunction emptyList<Map<String, Any>>()
      BufferedActivityTransitionStore.getBufferedTransitions(context).map { payload ->
        mapOf(
          "id" to payload.id,
          "activityType" to payload.activityType,
          "transitionType" to payload.transitionType,
          "confidence" to payload.confidence,
          "timestamp" to payload.timestamp,
        )
      }
    }

    AsyncFunction("readBufferedActivityTransitionsSinceAsync") { cursorExclusive: Double?, limit: Int? ->
      val context = getContext() ?: return@AsyncFunction emptyList<Map<String, Any>>()
      BufferedActivityTransitionStore.getBufferedTransitionsSince(
        context,
        cursorExclusive?.toLong(),
        limit ?: 250,
      ).map { record ->
        mapOf(
          "cursor" to record.cursor,
          "id" to record.payload.id,
          "activityType" to record.payload.activityType,
          "transitionType" to record.payload.transitionType,
          "confidence" to record.payload.confidence,
          "timestamp" to record.payload.timestamp,
        )
      }
    }

    AsyncFunction("getBufferedActivityTransitionCountAsync") {
      val context = getContext() ?: return@AsyncFunction 0
      BufferedActivityTransitionStore.getBufferedTransitionCount(context)
    }

    AsyncFunction("acknowledgeBufferedActivityTransitionsAsync") { ids: ArrayList<String> ->
      val context = getContext() ?: return@AsyncFunction 0
      BufferedActivityTransitionStore.acknowledgeTransitions(context, ids)
    }

    AsyncFunction("startBackgroundCollectionServiceAsync") { trackLocation: Boolean, trackActivity: Boolean ->
      val context = getContext() ?: return@AsyncFunction false
      ZentraBackgroundCollectionService.start(context, trackLocation, trackActivity)
      true
    }

    AsyncFunction("stopBackgroundCollectionServiceAsync") {
      val context = getContext() ?: return@AsyncFunction false
      ZentraBackgroundCollectionService.stop(context)
      true
    }

    AsyncFunction("isBackgroundCollectionServiceRunningAsync") {
      ZentraBackgroundCollectionService.isRunning()
    }

    AsyncFunction("getHealthConnectAvailabilityAsync") {
      getHealthConnectController()?.getAvailability() ?: "unsupported"
    }

    AsyncFunction("getUsageAccessPermissionStatusAsync") {
      getUsageStatsController()?.getPermissionStatus() ?: "unsupported"
    }

    AsyncFunction("openUsageAccessSettingsAsync") {
      getUsageStatsController()?.openUsageAccessSettings() ?: false
    }

    AsyncFunction("readUsageEventsAsync") { startIso: String, endIso: String ->
      getUsageStatsController()?.readUsageEvents(startIso, endIso) ?: emptyList<Map<String, Any?>>()
    }

    AsyncFunction("getGrantedHealthConnectPermissionsAsync") { promise: Promise ->
      val controller = getHealthConnectController()
      if (controller == null) {
        promise.resolve(arrayListOf<String>())
        return@AsyncFunction
      }

      appContext.backgroundCoroutineScope.launch {
        try {
          promise.resolve(controller.getGrantedPermissions())
        } catch (error: Throwable) {
          promise.reject("ERR_HEALTH_PERMISSIONS", error.message, error)
        }
      }
    }

    AsyncFunction("openHealthConnectSettingsAsync") {
      getHealthConnectController()?.openSettings() ?: false
    }

    AsyncFunction("openHealthConnectPermissionRequestAsync") {
      val controller = getHealthConnectController() ?: return@AsyncFunction false
      if (controller.getAvailability() != "available") {
        return@AsyncFunction false
      }

      controller.openPermissionRequest()
    }

    AsyncFunction("requestHealthConnectPermissionsAsync") { promise: Promise ->
      val controller = getHealthConnectController()
      if (controller == null || controller.getAvailability() != "available") {
        promise.resolve(arrayListOf<String>())
        return@AsyncFunction
      }

      appContext.mainQueue.launch {
        try {
          healthConnectPermissionsLauncher.launch(
            HealthConnectPermissionRequest(controller.requiredPermissions()),
          ) { grantedPermissions ->
            promise.resolve(grantedPermissions)
          }
        } catch (error: Throwable) {
          promise.reject("ERR_HEALTH_PERMISSION_REQUEST", error.message, error)
        }
      }
    }

    AsyncFunction("readHealthConnectRecordsAsync") { startIso: String, endIso: String, promise: Promise ->
      val controller = getHealthConnectController()
      if (controller == null) {
        promise.resolve(emptyList<Map<String, Any?>>())
        return@AsyncFunction
      }

      appContext.backgroundCoroutineScope.launch {
        try {
          promise.resolve(controller.readRecords(startIso, endIso))
        } catch (error: Throwable) {
          promise.reject("ERR_HEALTH_READ", error.message, error)
        }
      }
    }
  }

  private fun getActivityRecognitionController(): ActivityRecognitionController? {
    val context = getContext() ?: return null
    return ActivityRecognitionController(context, appContext)
  }

  private fun getHealthConnectController(): HealthConnectController? {
    val context = appContext.reactContext ?: return null
    return HealthConnectController(context)
  }

  private fun getUsageStatsController(): UsageStatsController? {
    val context = getContext() ?: return null
    return UsageStatsController(context)
  }

  private fun getContext() = appContext.reactContext ?: appContext.currentActivity?.applicationContext
}
