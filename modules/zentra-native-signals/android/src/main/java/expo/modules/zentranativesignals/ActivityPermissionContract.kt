package expo.modules.zentranativesignals

import android.content.Context
import android.content.Intent
import androidx.activity.result.contract.ActivityResultContracts
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import java.io.Serializable

internal data class ActivityPermissionRequest(val permission: String) : Serializable

internal class ActivityPermissionContract : AppContextActivityResultContract<ActivityPermissionRequest, Boolean> {
  private val delegate = ActivityResultContracts.RequestPermission()

  override fun createIntent(context: Context, input: ActivityPermissionRequest): Intent {
    return delegate.createIntent(context, input.permission)
  }

  override fun parseResult(input: ActivityPermissionRequest, resultCode: Int, intent: Intent?): Boolean {
    return delegate.parseResult(resultCode, intent)
  }
}
