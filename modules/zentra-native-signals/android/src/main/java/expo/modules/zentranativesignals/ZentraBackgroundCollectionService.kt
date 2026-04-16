package expo.modules.zentranativesignals

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

class ZentraBackgroundCollectionService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopForegroundCompat()
        stopSelf()
        return START_NOT_STICKY
      }

      else -> {
        val trackLocation = intent?.getBooleanExtra(EXTRA_TRACK_LOCATION, false) == true
        val trackActivity = intent?.getBooleanExtra(EXTRA_TRACK_ACTIVITY, false) == true

        if (!trackLocation && !trackActivity) {
          stopForegroundCompat()
          stopSelf()
          return START_NOT_STICKY
        }

        ensureNotificationChannel()
        ServiceCompat.startForeground(
          this,
          NOTIFICATION_ID,
          buildNotification(trackLocation, trackActivity),
          ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
        )
        isRunning = true
        return START_STICKY
      }
    }
  }

  override fun onDestroy() {
    isRunning = false
    super.onDestroy()
  }

  private fun buildNotification(
    trackLocation: Boolean,
    trackActivity: Boolean,
  ): Notification {
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Zentra background collection active")
      .setContentText(buildNotificationBody(trackLocation, trackActivity))
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .build()
  }

  private fun buildNotificationBody(
    trackLocation: Boolean,
    trackActivity: Boolean,
  ): String {
    return when {
      trackLocation && trackActivity ->
        "Zentra is keeping local location and activity collection available in the background."
      trackLocation ->
        "Zentra is keeping local location collection available in the background."
      else ->
        "Zentra is keeping local activity collection available in the background."
    }
  }

  private fun ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val manager = getSystemService(NotificationManager::class.java) ?: return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Background collection",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Persistent notification for local background collection"
      setShowBadge(false)
    }

    manager.createNotificationChannel(channel)
  }

  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    isRunning = false
  }

  companion object {
    private const val ACTION_START = "expo.modules.zentranativesignals.action.START_BACKGROUND_COLLECTION"
    private const val ACTION_STOP = "expo.modules.zentranativesignals.action.STOP_BACKGROUND_COLLECTION"
    private const val CHANNEL_ID = "zentra_background_collection"
    private const val EXTRA_TRACK_ACTIVITY = "trackActivity"
    private const val EXTRA_TRACK_LOCATION = "trackLocation"
    private const val NOTIFICATION_ID = 1042

    @Volatile
    private var isRunning = false

    fun isRunning(): Boolean = isRunning

    fun start(
      context: Context,
      trackLocation: Boolean,
      trackActivity: Boolean,
    ) {
      val intent = Intent(context, ZentraBackgroundCollectionService::class.java).apply {
        action = ACTION_START
        putExtra(EXTRA_TRACK_LOCATION, trackLocation)
        putExtra(EXTRA_TRACK_ACTIVITY, trackActivity)
      }

      ContextCompat.startForegroundService(context, intent)
    }

    fun stop(context: Context) {
      val intent = Intent(context, ZentraBackgroundCollectionService::class.java).apply {
        action = ACTION_STOP
      }

      context.startService(intent)
    }
  }
}