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

class MainActivity : Activity() {
    private lateinit var statusText: TextView
    private lateinit var endpointText: TextView
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
        pairingCodeText = findViewById(R.id.pairingCodeText)
        pairingOptionsText = findViewById(R.id.pairingOptionsText)
        pairNewDeviceButton = findViewById(R.id.pairNewDeviceButton)
        refreshPairingButton = findViewById(R.id.refreshPairingButton)
        pairedSessionsContainer = findViewById(R.id.pairedSessionsContainer)
        refreshSessionsButton = findViewById(R.id.refreshSessionsButton)
        permissionButton = findViewById(R.id.permissionButton)

        endpointText.text = getString(R.string.endpoint_label, BuildConfig.SMS_API_URL)
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
            permissionButton.isEnabled = false
            permissionButton.text = getString(R.string.permission_granted)
            SmsSyncScheduler.ensurePeriodic(this)
        } else {
            statusText.text = getString(R.string.status_permission_required)
            permissionButton.isEnabled = true
            permissionButton.text = getString(R.string.permission_request)
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
        pairedSessionsContainer.addView(buildSessionText(getString(R.string.pairing_answer_loading)))

        DeviceRegistrar(this).fetchSessionsAsync { sessions ->
            runOnUiThread {
                pairedSessionsContainer.removeAllViews()

                if (sessions == null) {
                    pairedSessionsContainer.addView(buildSessionText(getString(R.string.pairing_answer_unavailable)))
                    return@runOnUiThread
                }

                sessions.forEach { session ->
                    pairedSessionsContainer.addView(buildSessionRow(session))
                }
            }
        }
    }

    private fun buildSessionRow(session: WebSessionSlot): View {
        val row = LinearLayout(this)
        row.orientation = LinearLayout.VERTICAL
        row.setPadding(0, 8, 0, 8)

        row.addView(
            buildSessionText(
                if (session.paired) {
                    getString(R.string.session_slot_paired, session.slot)
                } else {
                    getString(R.string.session_slot_empty, session.slot)
                }
            )
        )

        if (session.paired) {
            val button = Button(this)
            button.text = getString(R.string.unpair_slot, session.slot)
            button.setOnClickListener {
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
            row.addView(button)
        }

        return row
    }

    private fun buildSessionText(text: String): TextView {
        val view = TextView(this)
        view.text = text
        view.setTextColor(getColor(R.color.text_secondary))
        view.textSize = 15f
        view.setPadding(0, 6, 0, 6)
        return view
    }

    companion object {
        private const val SMS_PERMISSION_REQUEST_CODE = 1001
    }
}
