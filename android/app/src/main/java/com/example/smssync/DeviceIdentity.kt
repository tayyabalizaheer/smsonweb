package com.example.smssync

import android.content.Context
import android.os.Build
import kotlin.random.Random

class DeviceIdentity(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    fun getCode(): String {
        val existingCode = preferences.getString(KEY_CODE, null)

        if (!existingCode.isNullOrBlank()) {
            return existingCode
        }

        val code = Random.nextInt(100000, 1000000).toString()
        preferences.edit().putString(KEY_CODE, code).apply()
        return code
    }

    fun getDeviceName(): String {
        return "${Build.MANUFACTURER} ${Build.MODEL}".trim().ifBlank { "Android Device" }
    }

    companion object {
        private const val PREFERENCES = "sms_sync_device_identity"
        private const val KEY_CODE = "device_code"
    }
}
