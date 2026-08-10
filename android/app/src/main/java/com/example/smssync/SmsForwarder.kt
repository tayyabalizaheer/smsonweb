package com.example.smssync

import android.util.Log
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

class SmsForwarder {
    fun forward(sender: String, body: String) {
        val payload = JSONObject()
            .put("sender", sender)
            .put("body", body)
            .toString()

        val request = Request.Builder()
            .url(BuildConfig.SMS_API_URL)
            .post(payload.toRequestBody(JSON_MEDIA_TYPE))
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e(TAG, "Failed to forward SMS to ${BuildConfig.SMS_API_URL}", e)
            }

            override fun onResponse(call: Call, response: Response) {
                response.use {
                    if (!it.isSuccessful) {
                        val responseBody = it.body?.string().orEmpty()
                        Log.e(TAG, "SMS forward failed with HTTP ${it.code}: $responseBody")
                    } else {
                        Log.d(TAG, "SMS forwarded successfully.")
                    }
                }
            }
        })
    }

    companion object {
        private const val TAG = "SmsForwarder"
        private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

        private val client = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .writeTimeout(10, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }
}
