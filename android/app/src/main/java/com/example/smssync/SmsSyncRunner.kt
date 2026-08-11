package com.example.smssync

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager

object SmsSyncRunner {
    private const val BATCH_SIZE = 100

    fun syncNow(context: Context): Int {
        val appContext = context.applicationContext

        if (appContext.checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
            return 0
        }

        DeviceRegistrar(appContext).registerBlocking()
        val messages = SmsStore(appContext).readInboxAndSent()
        var uploaded = 0

        messages.chunked(BATCH_SIZE).forEach { batch ->
            uploaded += SmsForwarder(appContext).forwardBatch(batch)
        }

        return uploaded
    }
}
