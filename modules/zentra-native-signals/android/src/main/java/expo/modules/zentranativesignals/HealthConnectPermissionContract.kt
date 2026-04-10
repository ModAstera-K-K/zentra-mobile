package expo.modules.zentranativesignals

import android.content.Context
import android.content.Intent
import androidx.health.connect.client.PermissionController
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import java.io.Serializable

internal data class HealthConnectPermissionRequest(val permissions: ArrayList<String>) : Serializable

internal class HealthConnectPermissionContract : AppContextActivityResultContract<HealthConnectPermissionRequest, ArrayList<String>> {
  private val delegate = PermissionController.createRequestPermissionResultContract()

  override fun createIntent(context: Context, input: HealthConnectPermissionRequest): Intent {
    return delegate.createIntent(context, input.permissions.toSet())
  }

  override fun parseResult(
    input: HealthConnectPermissionRequest,
    resultCode: Int,
    intent: Intent?,
  ): ArrayList<String> {
    return ArrayList(delegate.parseResult(resultCode, intent).toList())
  }
}
