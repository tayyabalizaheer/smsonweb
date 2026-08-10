package com.example.smssync

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.Button
import android.widget.TextView

class MainActivity : Activity() {
    private lateinit var statusText: TextView
    private lateinit var endpointText: TextView
    private lateinit var pairingCodeText: TextView
    private lateinit var pairingOptionsText: TextView
    private lateinit var refreshPairingButton: Button
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
        refreshPairingButton = findViewById(R.id.refreshPairingButton)
        permissionButton = findViewById(R.id.permissionButton)

        endpointText.text = getString(R.string.endpoint_label, BuildConfig.SMS_API_URL)
        renderPairingChallenge()
        DeviceRegistrar(this).registerAsync()
        permissionButton.setOnClickListener {
            requestSmsPermissionsOrSync()
        }
        refreshPairingButton.setOnClickListener {
            identity.refreshPairingChallenge()
            renderPairingChallenge()
            DeviceRegistrar(this).registerAsync()
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

    private fun renderPairingChallenge() {
        val challenge = identity.getPairingChallenge()

        pairingCodeText.text = getString(R.string.pairing_code_label, identity.getCode())
        pairingOptionsText.text = getString(
            R.string.pairing_options_label,
            challenge.options.joinToString(separator = "   "),
            challenge.answer
        )
    }

    companion object {
        private const val SMS_PERMISSION_REQUEST_CODE = 1001
    }
}
