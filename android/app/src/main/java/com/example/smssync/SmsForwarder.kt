package com.example.smssync

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

class SmsForwarder(private val context: android.content.Context) {
    @Throws(IOException::class)
    fun forwardBatch(messages: List<SmsRecord>): Int {
        if (messages.isEmpty()) {
            return 0
        }

        val deviceCode = DeviceIdentity(context.applicationContext).getCode()
        val payloadMessages = JSONArray()

        messages.forEach { message ->
            payloadMessages.put(
                JSONObject()
                    .put("deviceMessageId", message.deviceMessageId)
                    .put("address", message.address)
                    .put("contactName", message.contactName)
                    .put("contactEmail", message.contactEmail)
                    .put("direction", message.direction)
                    .put("body", message.body)
                    .put("messageAt", message.messageAtMillis)
            )
        }

        val payload = JSONObject()
            .put("deviceCode", deviceCode)
            .put("messages", payloadMessages)
            .toString()

        val request = Request.Builder()
            .url(BuildConfig.SMS_BULK_API_URL)
            .post(payload.toRequestBody(JSON_MEDIA_TYPE))
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                val responseBody = response.body?.string().orEmpty()
                throw IOException("SMS sync failed with HTTP ${response.code}: $responseBody")
            }
        }

        return messages.size
    }

    companion object {
        private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

        private val client = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }
}
