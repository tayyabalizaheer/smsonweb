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
    private lateinit var permissionButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        statusText = findViewById(R.id.statusText)
        endpointText = findViewById(R.id.endpointText)
        permissionButton = findViewById(R.id.permissionButton)

        endpointText.text = getString(R.string.endpoint_label, BuildConfig.SMS_API_URL)
        permissionButton.setOnClickListener {
            requestReceiveSmsPermission()
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

        if (requestCode == RECEIVE_SMS_REQUEST_CODE) {
            updatePermissionState()
        }
    }

    private fun updatePermissionState() {
        val receiveSmsGranted = checkSelfPermission(Manifest.permission.RECEIVE_SMS) ==
            PackageManager.PERMISSION_GRANTED

        if (receiveSmsGranted) {
            statusText.text = getString(R.string.status_ready)
            permissionButton.isEnabled = false
            permissionButton.text = getString(R.string.permission_granted)
        } else {
            statusText.text = getString(R.string.status_permission_required)
            permissionButton.isEnabled = true
            permissionButton.text = getString(R.string.permission_request)
        }
    }

    private fun requestReceiveSmsPermission() {
        if (checkSelfPermission(Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                arrayOf(Manifest.permission.RECEIVE_SMS),
                RECEIVE_SMS_REQUEST_CODE
            )
        }
    }

    companion object {
        private const val RECEIVE_SMS_REQUEST_CODE = 1001
    }
}
