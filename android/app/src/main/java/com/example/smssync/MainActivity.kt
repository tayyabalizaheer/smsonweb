package com.example.smssync

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.concurrent.thread

class MainActivity : Activity() {
    private lateinit var statusText: TextView
    private lateinit var endpointText: TextView
    private lateinit var deviceCodeText: TextView
    private lateinit var deviceStatusText: TextView
    private lateinit var deviceNameText: TextView
    private lateinit var smsCountText: TextView
    private lateinit var contactsCountText: TextView
    private lateinit var linkedCountText: TextView
    private lateinit var pairingCodeText: TextView
    private lateinit var pairingOptionsText: TextView
    private lateinit var pairNewDeviceButton: Button
    private lateinit var refreshPairingButton: Button
    private lateinit var pairedSessionsContainer: LinearLayout
    private lateinit var refreshSessionsButton: Button
    private lateinit var permissionButton: Button
    private lateinit var identity: DeviceIdentity

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        identity = DeviceIdentity(this)
        statusText = findViewById(R.id.statusText)
        endpointText = findViewById(R.id.endpointText)
        deviceCodeText = findViewById(R.id.deviceCodeText)
        deviceStatusText = findViewById(R.id.deviceStatusText)
        deviceNameText = findViewById(R.id.deviceNameText)
        smsCountText = findViewById(R.id.smsCountText)
        contactsCountText = findViewById(R.id.contactsCountText)
        linkedCountText = findViewById(R.id.linkedCountText)
        pairingCodeText = findViewById(R.id.pairingCodeText)
        pairingOptionsText = findViewById(R.id.pairingOptionsText)
        pairNewDeviceButton = findViewById(R.id.pairNewDeviceButton)
        refreshPairingButton = findViewById(R.id.refreshPairingButton)
        pairedSessionsContainer = findViewById(R.id.pairedSessionsContainer)
        refreshSessionsButton = findViewById(R.id.refreshSessionsButton)
        permissionButton = findViewById(R.id.permissionButton)

        endpointText.text = getString(R.string.endpoint_label, BuildConfig.SMS_API_URL)
        deviceCodeText.text = getString(R.string.device_code_label, identity.getCode())
        deviceStatusText.text = getString(R.string.device_ready)
        deviceNameText.text = identity.getDeviceName()
        DeviceRegistrar(this).registerAsync()
        startDeviceHealthService()
        loadPairedSessions()
        pairNewDeviceButton.setOnClickListener {
            renderPairingCode()
        }
        permissionButton.setOnClickListener {
            requestSmsPermissionsOrSync()
        }
        refreshPairingButton.setOnClickListener {
            DeviceRegistrar(this).registerAsync()
            fetchLatestPairingAnswer()
        }
        refreshSessionsButton.setOnClickListener {
            loadPairedSessions()
        }

        updatePermissionState()
    }

    override fun onResume() {
        super.onResume()
        updatePermissionState()
        updateHomeStats()
        loadPairedSessions()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)

        if (requestCode == SMS_PERMISSION_REQUEST_CODE) {
            if (hasSmsPermissions()) {
                SmsSyncScheduler.enqueueImmediate(this)
                SmsSyncScheduler.ensurePeriodic(this)
            }

            updatePermissionState()
        }
    }

    private fun updatePermissionState() {
        if (hasSmsPermissions()) {
            statusText.text = getString(R.string.status_ready)
            deviceStatusText.text = getString(R.string.device_online)
            permissionButton.isEnabled = false
            permissionButton.text = getString(R.string.permission_granted)
            SmsSyncScheduler.ensurePeriodic(this)
            updateHomeStats()
        } else {
            statusText.text = getString(R.string.status_permission_required)
            deviceStatusText.text = getString(R.string.device_ready)
            permissionButton.isEnabled = true
            permissionButton.text = getString(R.string.permission_request)
            smsCountText.text = getString(R.string.stat_zero)
            contactsCountText.text = getString(R.string.stat_zero)
        }
    }

    private fun updateHomeStats() {
        if (!hasSmsPermissions()) {
            return
        }

        thread {
            val stats = try {
                SmsStore(this).readStats()
            } catch (err: Exception) {
                SmsStats(totalMessages = 0, contactCount = 0)
            }

            runOnUiThread {
                smsCountText.text = stats.totalMessages.toString()
                contactsCountText.text = stats.contactCount.toString()
            }
        }
    }

    private fun requestSmsPermissionsOrSync() {
        if (!hasSmsPermissions()) {
            requestPermissions(
                arrayOf(
                    Manifest.permission.RECEIVE_SMS,
                    Manifest.permission.READ_SMS,
                    Manifest.permission.READ_CONTACTS
                ),
                SMS_PERMISSION_REQUEST_CODE
            )
        } else {
            SmsSyncScheduler.enqueueImmediate(this)
        }
    }

    private fun hasSmsPermissions(): Boolean {
        return checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED &&
            checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED
    }

    private fun renderPairingCode() {
        pairingCodeText.visibility = View.VISIBLE
        pairingOptionsText.visibility = View.VISIBLE
        refreshPairingButton.visibility = View.VISIBLE
        pairingCodeText.text = getString(R.string.pairing_code_label, identity.getCode())
        pairingOptionsText.text = getString(R.string.pairing_answer_waiting)
    }

    private fun fetchLatestPairingAnswer() {
        pairingOptionsText.text = getString(R.string.pairing_answer_loading)
        DeviceRegistrar(this).fetchPairingAnswerAsync { answer ->
            runOnUiThread {
                pairingOptionsText.text = if (answer.isNullOrBlank()) {
                    getString(R.string.pairing_answer_unavailable)
                } else {
                    getString(R.string.pairing_answer_label, answer)
                }
            }
        }
    }

    private fun startDeviceHealthService() {
        val intent = Intent(this, DeviceHealthService::class.java)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    private fun loadPairedSessions() {
        pairedSessionsContainer.removeAllViews()
        pairedSessionsContainer.addView(
            buildMiniRow(
                title = getString(R.string.android_device_row),
                subtitle = getString(R.string.android_device_subtitle, identity.getCode()),
                badge = "A",
                actionText = null,
                onAction = null
            )
        )
        pairedSessionsContainer.addView(buildSessionText(getString(R.string.pairing_answer_loading)))

        DeviceRegistrar(this).fetchSessionsAsync { sessions ->
            runOnUiThread {
                pairedSessionsContainer.removeAllViews()
                pairedSessionsContainer.addView(
                    buildMiniRow(
                        title = getString(R.string.android_device_row),
                        subtitle = getString(R.string.android_device_subtitle, identity.getCode()),
                        badge = "A",
                        actionText = null,
                        onAction = null
                    )
                )

                if (sessions == null) {
                    linkedCountText.text = getString(R.string.stat_linked_initial)
                    pairedSessionsContainer.addView(buildSessionText(getString(R.string.pairing_answer_unavailable)))
                    return@runOnUiThread
                }

                linkedCountText.text = getString(
                    R.string.stat_linked_value,
                    sessions.count { it.paired }
                )
                sessions.forEach { session ->
                    pairedSessionsContainer.addView(buildSessionRow(session))
                }
            }
        }
    }

    private fun buildSessionRow(session: WebSessionSlot): View {
        return buildMiniRow(
            title = getString(R.string.session_slot_title, session.slot),
            subtitle = if (session.paired) {
                getString(R.string.session_slot_paired_subtitle)
            } else {
                getString(R.string.session_slot_empty_subtitle)
            },
            badge = "W",
            actionText = if (session.paired) getString(R.string.unpair_slot, session.slot) else null,
            onAction = if (session.paired) {
                { button ->
                    button.isEnabled = false
                    DeviceRegistrar(this).unpairSessionAsync(session.slot) { success ->
                        runOnUiThread {
                            if (success) {
                                loadPairedSessions()
                            } else {
                                button.isEnabled = true
                            }
                        }
                    }
                }
            } else {
                null
            }
        )
    }

    private fun buildSessionText(text: String): TextView {
        val view = TextView(this)
        view.text = text
        view.setTextColor(getColor(R.color.text_secondary))
        view.textSize = 15f
        view.setPadding(0, 6, 0, 6)
        return view
    }

    private fun buildMiniRow(
        title: String,
        subtitle: String,
        badge: String,
        actionText: String?,
        onAction: ((Button) -> Unit)?
    ): View {
        val density = resources.displayMetrics.density
        val row = LinearLayout(this)
        row.orientation = LinearLayout.HORIZONTAL
        row.gravity = android.view.Gravity.CENTER_VERTICAL
        row.setBackgroundResource(R.drawable.session_row_background)
        row.setPadding(
            (12 * density).toInt(),
            (10 * density).toInt(),
            (12 * density).toInt(),
            (10 * density).toInt()
        )

        val params = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        )
        params.setMargins(0, 0, 0, (8 * density).toInt())
        row.layoutParams = params

        val badgeView = TextView(this)
        badgeView.text = badge
        badgeView.gravity = android.view.Gravity.CENTER
        badgeView.setTextColor(getColor(R.color.primary_dark))
        badgeView.textSize = 14f
        badgeView.setTypeface(null, android.graphics.Typeface.BOLD)
        badgeView.setBackgroundResource(R.drawable.soft_button_background)
        row.addView(
            badgeView,
            LinearLayout.LayoutParams((38 * density).toInt(), (38 * density).toInt())
        )

        val copy = LinearLayout(this)
        copy.orientation = LinearLayout.VERTICAL
        copy.setPadding((10 * density).toInt(), 0, (8 * density).toInt(), 0)
        row.addView(
            copy,
            LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        )

        val titleView = TextView(this)
        titleView.text = title
        titleView.setTextColor(getColor(R.color.text_primary))
        titleView.textSize = 15f
        titleView.setTypeface(null, android.graphics.Typeface.BOLD)
        copy.addView(titleView)

        val subtitleView = TextView(this)
        subtitleView.text = subtitle
        subtitleView.setTextColor(getColor(R.color.text_secondary))
        subtitleView.textSize = 13f
        copy.addView(subtitleView)

        if (actionText != null && onAction != null) {
            val button = Button(this)
            button.text = actionText
            button.textSize = 12f
            button.minWidth = 0
            button.setPadding((10 * density).toInt(), 0, (10 * density).toInt(), 0)
            button.setOnClickListener {
                onAction(button)
            }
            row.addView(
                button,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    (42 * density).toInt()
                )
            )
        }

        return row
    }

    companion object {
        private const val SMS_PERMISSION_REQUEST_CODE = 1001
    }
}
