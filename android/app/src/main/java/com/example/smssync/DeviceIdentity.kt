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

    fun getPairingChallenge(): PairingChallenge {
        val existingOptions = preferences.getStringSet(KEY_OPTIONS, null)?.toList()?.sorted()
        val existingAnswer = preferences.getString(KEY_ANSWER, null)

        if (!existingOptions.isNullOrEmpty() && existingOptions.size == 3 && !existingAnswer.isNullOrBlank()) {
            return PairingChallenge(existingOptions, existingAnswer)
        }

        return refreshPairingChallenge()
    }

    fun refreshPairingChallenge(): PairingChallenge {
        val options = mutableSetOf<String>()

        while (options.size < 3) {
            options += Random.nextInt(100, 1000).toString()
        }

        val sortedOptions = options.toList().sorted()
        val answer = sortedOptions.random()

        preferences.edit()
            .putStringSet(KEY_OPTIONS, sortedOptions.toSet())
            .putString(KEY_ANSWER, answer)
            .apply()

        return PairingChallenge(sortedOptions, answer)
    }

    companion object {
        private const val PREFERENCES = "sms_sync_device_identity"
        private const val KEY_CODE = "device_code"
        private const val KEY_OPTIONS = "pairing_options"
        private const val KEY_ANSWER = "pairing_answer"
    }
}

data class PairingChallenge(
    val options: List<String>,
    val answer: String
)
