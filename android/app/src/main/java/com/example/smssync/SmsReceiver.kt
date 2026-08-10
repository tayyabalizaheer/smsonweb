package com.example.smssync

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
            return
        }

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)

        if (messages.isNullOrEmpty()) {
            Log.w(TAG, "SMS_RECEIVED intent did not contain SMS messages.")
            return
        }

        val sender = messages.firstNotNullOfOrNull {
            it.originatingAddress ?: it.displayOriginatingAddress
        } ?: UNKNOWN_SENDER

        val body = messages.joinToString(separator = "") {
            it.messageBody.orEmpty()
        }.trim()

        if (body.isBlank()) {
            Log.w(TAG, "Received SMS from $sender with empty body; skipping forward.")
            return
        }

        SmsForwarder().forward(sender, body)
    }

    companion object {
        private const val TAG = "SmsReceiver"
        private const val UNKNOWN_SENDER = "unknown"
    }
}
