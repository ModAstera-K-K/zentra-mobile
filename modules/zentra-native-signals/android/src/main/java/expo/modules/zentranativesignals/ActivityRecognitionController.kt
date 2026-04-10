package expo.modules.zentranativesignals

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.AppContext
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityRecognitionClient
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionRequest
import com.google.android.gms.tasks.Tasks

internal class ActivityRecognitionController(
  private val context: Context,
  private val appContext: AppContext,
) {
  private val client: ActivityRecognitionClient = ActivityRecognition.getClient(context)
  private val preferences by lazy {
    context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
  }

  fun getPermissionStatus(): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      return "granted"
    }

    if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED) {
      return "granted"
    }

    if (!preferences.getBoolean(KEY_ACTIVITY_PERMISSION_REQUESTED, false)) {
      return "not_requested"
    }

    val activity = appContext.currentActivity
    return if (activity?.shouldShowRequestPermissionRationale(Manifest.permission.ACTIVITY_RECOGNITION) == true) {
      "not_requested"
    } else {
      "blocked"
    }
  }

  fun markPermissionRequested() {
    preferences.edit().putBoolean(KEY_ACTIVITY_PERMISSION_REQUESTED, true).apply()
  }

  fun startUpdates(): Boolean {
    return try {
      Tasks.await(client.requestActivityTransitionUpdates(createTransitionRequest(), createPendingIntent()))
      true
    } catch (_: Exception) {
      false
    }
  }

  fun stopUpdates() {
    try {
      Tasks.await(client.removeActivityTransitionUpdates(createPendingIntent()))
    } catch (_: Exception) {
    }
  }

  private fun createTransitionRequest(): ActivityTransitionRequest {
    val activityTypes = listOf(
      com.google.android.gms.location.DetectedActivity.STILL,
      com.google.android.gms.location.DetectedActivity.WALKING,
      com.google.android.gms.location.DetectedActivity.RUNNING,
      com.google.android.gms.location.DetectedActivity.IN_VEHICLE,
      com.google.android.gms.location.DetectedActivity.ON_BICYCLE,
    )

    val transitions = activityTypes.flatMap { activityType ->
      listOf(
        ActivityTransition.Builder()
          .setActivityType(activityType)
          .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER)
          .build(),
        ActivityTransition.Builder()
          .setActivityType(activityType)
          .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_EXIT)
          .build(),
      )
    }

    return ActivityTransitionRequest(transitions)
  }

  private fun createPendingIntent(): PendingIntent {
    val intent = Intent(context, ActivityTransitionReceiver::class.java).apply {
      action = ActivityTransitionReceiver.ACTION_ACTIVITY_TRANSITION
    }

    return PendingIntent.getBroadcast(
      context,
      ACTIVITY_REQUEST_CODE,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  companion object {
    private const val ACTIVITY_REQUEST_CODE = 4411
    private const val PREFERENCES_NAME = "zentra_native_signals"
    private const val KEY_ACTIVITY_PERMISSION_REQUESTED = "activity_permission_requested"
  }
}
