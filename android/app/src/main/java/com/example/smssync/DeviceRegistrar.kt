package com.example.smssync

import android.content.Context
import android.util.Log
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

class DeviceRegistrar(private val context: Context) {
    private val identity = DeviceIdentity(context.applicationContext)

    @Throws(IOException::class)
    fun registerBlocking() {
        client.newCall(buildRequest()).execute().use { response ->
            if (!response.isSuccessful) {
                val responseBody = response.body?.string().orEmpty()
                throw IOException("Device registration failed with HTTP ${response.code}: $responseBody")
            }
        }
    }

    fun registerAsync() {
        client.newCall(buildRequest()).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e(TAG, "Failed to register pairing device.", e)
            }

            override fun onResponse(call: Call, response: Response) {
                response.use {
                    if (!it.isSuccessful) {
                        Log.e(TAG, "Device registration failed with HTTP ${it.code}: ${it.body?.string().orEmpty()}")
                    }
                }
            }
        })
    }

    @Throws(IOException::class)
    fun pingBlocking() {
        val payload = JSONObject()
            .put("code", identity.getCode())
            .put("name", identity.getDeviceName())
            .toString()

        val request = Request.Builder()
            .url(BuildConfig.DEVICE_HEALTH_API_URL)
            .post(payload.toRequestBody(JSON_MEDIA_TYPE))
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                val responseBody = response.body?.string().orEmpty()
                throw IOException("Device health failed with HTTP ${response.code}: $responseBody")
            }
        }
    }

    fun fetchPairingAnswerAsync(onResult: (String?) -> Unit) {
        val code = URLEncoder.encode(identity.getCode(), "UTF-8")
        val request = Request.Builder()
            .url("${BuildConfig.DEVICE_PAIRING_CHALLENGE_API_URL}?code=$code")
            .get()
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e(TAG, "Failed to fetch latest pairing answer.", e)
                onResult(null)
            }

            override fun onResponse(call: Call, response: Response) {
                response.use {
                    if (!it.isSuccessful) {
                        Log.e(TAG, "Pairing answer fetch failed with HTTP ${it.code}: ${it.body?.string().orEmpty()}")
                        onResult(null)
                        return
                    }

                    val answer = try {
                        JSONObject(it.body?.string().orEmpty()).optString("answer", "")
                    } catch (err: Exception) {
                        ""
                    }

                    onResult(answer.ifBlank { null })
                }
            }
        })
    }

    fun fetchSessionsAsync(onResult: (List<WebSessionSlot>?) -> Unit) {
        val code = URLEncoder.encode(identity.getCode(), "UTF-8")
        val request = Request.Builder()
            .url("${BuildConfig.DEVICE_SESSIONS_API_URL}?code=$code")
            .get()
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e(TAG, "Failed to fetch web sessions.", e)
                onResult(null)
            }

            override fun onResponse(call: Call, response: Response) {
                response.use {
                    if (!it.isSuccessful) {
                        Log.e(TAG, "Session fetch failed with HTTP ${it.code}: ${it.body?.string().orEmpty()}")
                        onResult(null)
                        return
                    }

                    val sessions = try {
                        parseSessions(JSONObject(it.body?.string().orEmpty()).getJSONArray("sessions"))
                    } catch (err: Exception) {
                        null
                    }

                    onResult(sessions)
                }
            }
        })
    }

    fun unpairSessionAsync(slot: Int, onResult: (Boolean) -> Unit) {
        val payload = JSONObject()
            .put("code", identity.getCode())
            .put("slot", slot)
            .toString()

        val request = Request.Builder()
            .url(BuildConfig.DEVICE_UNPAIR_SESSION_API_URL)
            .post(payload.toRequestBody(JSON_MEDIA_TYPE))
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e(TAG, "Failed to unpair web session.", e)
                onResult(false)
            }

            override fun onResponse(call: Call, response: Response) {
                response.use {
                    onResult(it.isSuccessful)
                }
            }
        })
    }

    private fun parseSessions(items: JSONArray): List<WebSessionSlot> {
        val sessions = mutableListOf<WebSessionSlot>()

        for (index in 0 until items.length()) {
            val item = items.getJSONObject(index)
            sessions += WebSessionSlot(
                slot = item.getInt("slot"),
                paired = item.getBoolean("paired")
            )
        }

        return sessions
    }

    private fun buildRequest(): Request {
        val payload = JSONObject()
            .put("code", identity.getCode())
            .put("name", identity.getDeviceName())
            .toString()

        return Request.Builder()
            .url(BuildConfig.DEVICE_REGISTER_API_URL)
            .post(payload.toRequestBody(JSON_MEDIA_TYPE))
            .build()
    }

    companion object {
        private const val TAG = "DeviceRegistrar"
        private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

        private val client = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }
}

data class WebSessionSlot(
    val slot: Int,
    val paired: Boolean
)
