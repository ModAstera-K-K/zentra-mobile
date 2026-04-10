package expo.modules.zentranativesignals

import android.content.Intent
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant

internal class HealthConnectController(private val context: android.content.Context) {
  private fun getClient(): HealthConnectClient = HealthConnectClient.getOrCreate(context)

  fun getAvailability(): String {
    return when (HealthConnectClient.getSdkStatus(context, PROVIDER_PACKAGE_NAME)) {
      HealthConnectClient.SDK_AVAILABLE -> "available"
      HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "not_installed"
      else -> "unsupported"
    }
  }

  fun requiredPermissions(): ArrayList<String> {
    return arrayListOf(
      HealthPermission.getReadPermission(StepsRecord::class),
      HealthPermission.getReadPermission(SleepSessionRecord::class),
      HealthPermission.getReadPermission(HeartRateRecord::class),
      HealthPermission.getReadPermission(ExerciseSessionRecord::class),
    )
  }

  fun openSettings(): Boolean {
    return try {
      val intent = Intent(HEALTH_CONNECT_SETTINGS_ACTION).apply {
        setPackage(PROVIDER_PACKAGE_NAME)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
      true
    } catch (_: Exception) {
      false
    }
  }

  fun openPermissionRequest(): Boolean {
    if (getAvailability() != "available") {
      return false
    }

    return try {
      val delegate = PermissionController.createRequestPermissionResultContract()
      val intent = delegate.createIntent(context, requiredPermissions().toSet()).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
      true
    } catch (_: Exception) {
      false
    }
  }

  suspend fun getGrantedPermissions(): ArrayList<String> {
    if (getAvailability() != "available") {
      return arrayListOf()
    }

    return ArrayList(getClient().permissionController.getGrantedPermissions().toList())
  }

  suspend fun readRecords(startIso: String, endIso: String): List<Map<String, Any?>> {
    if (getAvailability() != "available") {
      return emptyList()
    }

    val startTime = Instant.parse(startIso)
    val endTime = Instant.parse(endIso)
    val timeRangeFilter = TimeRangeFilter.between(startTime, endTime)
    val client = getClient()
    val records = mutableListOf<Map<String, Any?>>()

    client.readRecords(ReadRecordsRequest(StepsRecord::class, timeRangeFilter = timeRangeFilter))
      .records
      .forEach { record ->
        records.add(HealthConnectRecordSerializers.serializeStepsRecord(record))
      }

    client.readRecords(ReadRecordsRequest(SleepSessionRecord::class, timeRangeFilter = timeRangeFilter))
      .records
      .forEach { record ->
        records.add(HealthConnectRecordSerializers.serializeSleepRecord(record))
      }

    client.readRecords(ReadRecordsRequest(HeartRateRecord::class, timeRangeFilter = timeRangeFilter))
      .records
      .forEach { record ->
        HealthConnectRecordSerializers.serializeHeartRateRecord(record)?.let(records::add)
      }

    client.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, timeRangeFilter = timeRangeFilter))
      .records
      .forEach { record ->
        records.add(HealthConnectRecordSerializers.serializeExerciseRecord(record))
      }

    return records
  }

  companion object {
    private const val HEALTH_CONNECT_SETTINGS_ACTION = "androidx.health.ACTION_HEALTH_CONNECT_SETTINGS"
    private const val PROVIDER_PACKAGE_NAME = "com.google.android.apps.healthdata"
  }
}
