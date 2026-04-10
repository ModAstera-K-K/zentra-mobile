package expo.modules.zentranativesignals

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import java.time.Instant

internal class UsageStatsController(private val context: Context) {
  private val preferences by lazy {
    context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
  }

  fun getPermissionStatus(): String {
    if (!hasUsageAccess()) {
      return if (preferences.getBoolean(KEY_USAGE_ACCESS_REQUESTED, false)) {
        "blocked"
      } else {
        "not_requested"
      }
    }

    return "granted"
  }

  fun openUsageAccessSettings(): Boolean {
    return try {
      preferences.edit().putBoolean(KEY_USAGE_ACCESS_REQUESTED, true).apply()
      val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
      true
    } catch (_: Exception) {
      false
    }
  }

  fun readUsageEvents(startIso: String, endIso: String): List<Map<String, Any?>> {
    if (!hasUsageAccess()) {
      return emptyList()
    }

    val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
      ?: return emptyList()
    val events = usageStatsManager.queryEvents(
      Instant.parse(startIso).toEpochMilli(),
      Instant.parse(endIso).toEpochMilli(),
    )
    val event = UsageEvents.Event()
    val result = mutableListOf<Map<String, Any?>>()

    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      val eventType = mapEventType(event.eventType) ?: continue

      result.add(
        mapOf(
          "eventType" to eventType,
          "packageName" to event.packageName,
          "className" to event.className,
          "timestamp" to Instant.ofEpochMilli(event.timeStamp).toString(),
        ),
      )
    }

    return result
  }

  private fun hasUsageAccess(): Boolean {
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager
      ?: return false
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      appOps.unsafeCheckOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS,
        android.os.Process.myUid(),
        context.packageName,
      )
    } else {
      @Suppress("DEPRECATION")
      appOps.checkOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS,
        android.os.Process.myUid(),
        context.packageName,
      )
    }

    return mode == AppOpsManager.MODE_ALLOWED
  }

  private fun mapEventType(eventType: Int): String? =
    when (eventType) {
      UsageEvents.Event.ACTIVITY_RESUMED -> "activity_resumed"
      UsageEvents.Event.ACTIVITY_PAUSED -> "activity_paused"
      UsageEvents.Event.SCREEN_INTERACTIVE -> "screen_interactive"
      UsageEvents.Event.SCREEN_NON_INTERACTIVE -> "screen_non_interactive"
      UsageEvents.Event.KEYGUARD_HIDDEN -> "keyguard_hidden"
      else -> null
    }

  companion object {
    private const val PREFERENCES_NAME = "zentra_native_signals"
    private const val KEY_USAGE_ACCESS_REQUESTED = "usage_access_requested"
  }
}
