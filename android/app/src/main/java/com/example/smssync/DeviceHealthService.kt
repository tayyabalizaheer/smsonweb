package com.example.smssync

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

class DeviceHealthService : Service() {
    private var executor: ScheduledExecutorService? = null

    override fun onCreate() {
        super.onCreate()
        startForeground(NOTIFICATION_ID, buildNotification())
        startHeartbeat()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startHeartbeat()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        executor?.shutdownNow()
        executor = null
        super.onDestroy()
    }

    private fun startHeartbeat() {
        if (executor != null) {
            return
        }

        executor = Executors.newSingleThreadScheduledExecutor().also { service ->
            service.scheduleAtFixedRate({
                try {
                    DeviceRegistrar(applicationContext).pingBlocking()
                } catch (err: Exception) {
                    Log.e(TAG, "Device health ping failed.", err)
                }
            }, 0, 30, TimeUnit.SECONDS)
        }
    }

    private fun buildNotification(): Notification {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.health_channel_name),
                NotificationManager.IMPORTANCE_LOW
            )
            manager.createNotificationChannel(channel)
        }

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            Notification.Builder(this)
        }

        return builder
            .setSmallIcon(R.drawable.ic_sms_sync)
            .setContentTitle(getString(R.string.health_notification_title))
            .setContentText(getString(R.string.health_notification_text))
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val TAG = "DeviceHealthService"
        private const val CHANNEL_ID = "sms_sync_health"
        private const val NOTIFICATION_ID = 2001
    }
}
