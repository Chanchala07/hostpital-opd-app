package com.hospitalopdapp

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
    loadReactNative(this)
  }

  /**
   * Push notifications ("Your turn is next", "Your appointment time has moved"…)
   * arrive on this channel; firebase.json makes it FCM's default. High importance
   * so they pop up on screen instead of only appearing in the shade.
   */
  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel =
      NotificationChannel(
        NOTIFICATION_CHANNEL_ID,
        "Queue and appointment updates",
        NotificationManager.IMPORTANCE_HIGH,
      ).apply { description = "Your turn, token calls, appointment changes and booking requests" }
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  private companion object {
    const val NOTIFICATION_CHANNEL_ID = "opd_updates"
  }
}
