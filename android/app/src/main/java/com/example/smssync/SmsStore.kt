package com.example.smssync

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.BaseColumns
import android.provider.ContactsContract
import android.provider.Telephony

class SmsStore(private val context: Context) {
    fun readInboxAndSent(): List<SmsRecord> {
        val records = mutableListOf<SmsRecord>()
        val contactResolver = ContactResolver(context)
        val projection = arrayOf(
            BaseColumns._ID,
            Telephony.Sms.ADDRESS,
            Telephony.Sms.BODY,
            Telephony.Sms.DATE,
            Telephony.Sms.TYPE
        )
        val selection = "${Telephony.Sms.TYPE} IN (?, ?)"
        val selectionArgs = arrayOf(
            Telephony.Sms.MESSAGE_TYPE_INBOX.toString(),
            Telephony.Sms.MESSAGE_TYPE_SENT.toString()
        )
        val sortOrder = "${Telephony.Sms.DATE} ASC"

        context.contentResolver.query(
            Telephony.Sms.CONTENT_URI,
            projection,
            selection,
            selectionArgs,
            sortOrder
        )?.use { cursor ->
            val idIndex = cursor.getColumnIndexOrThrow(BaseColumns._ID)
            val addressIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
            val bodyIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
            val dateIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE)
            val typeIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.TYPE)

            while (cursor.moveToNext()) {
                val id = cursor.getLong(idIndex)
                val address = cursor.getString(addressIndex)?.trim().orEmpty()
                val body = cursor.getString(bodyIndex).orEmpty()
                val date = cursor.getLong(dateIndex)
                val type = cursor.getInt(typeIndex)
                val direction = when (type) {
                    Telephony.Sms.MESSAGE_TYPE_SENT -> "sent"
                    else -> "received"
                }

                if (address.isNotBlank() && body.isNotBlank()) {
                    val contact = contactResolver.findByPhoneNumber(address)

                    records += SmsRecord(
                        deviceMessageId = "android-sms:$id",
                        address = address,
                        contactName = contact?.name,
                        contactEmail = contact?.email,
                        body = body,
                        direction = direction,
                        messageAtMillis = date
                    )
                }
            }
        }

        return records
    }
}

private data class ContactIdentity(
    val name: String?,
    val email: String?
)

private class ContactResolver(private val context: Context) {
    private val cache = mutableMapOf<String, ContactIdentity?>()

    fun findByPhoneNumber(phoneNumber: String): ContactIdentity? {
        if (context.checkSelfPermission(Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            return null
        }

        return cache.getOrPut(phoneNumber) {
            val lookupUri = Uri.withAppendedPath(
                ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                Uri.encode(phoneNumber)
            )
            val projection = arrayOf(
                ContactsContract.PhoneLookup.DISPLAY_NAME,
                ContactsContract.PhoneLookup._ID
            )

            context.contentResolver.query(
                lookupUri,
                projection,
                null,
                null,
                null
            )?.use { cursor ->
                if (!cursor.moveToFirst()) {
                    return@getOrPut null
                }

                val nameIndex = cursor.getColumnIndexOrThrow(ContactsContract.PhoneLookup.DISPLAY_NAME)
                val contactIdIndex = cursor.getColumnIndexOrThrow(ContactsContract.PhoneLookup._ID)
                val contactId = cursor.getLong(contactIdIndex)

                ContactIdentity(
                    name = cursor.getString(nameIndex),
                    email = findEmail(contactId)
                )
            }
        }
    }

    private fun findEmail(contactId: Long): String? {
        val projection = arrayOf(ContactsContract.CommonDataKinds.Email.ADDRESS)
        val selection = "${ContactsContract.CommonDataKinds.Email.CONTACT_ID} = ?"
        val selectionArgs = arrayOf(contactId.toString())

        context.contentResolver.query(
            ContactsContract.CommonDataKinds.Email.CONTENT_URI,
            projection,
            selection,
            selectionArgs,
            null
        )?.use { cursor ->
            if (cursor.moveToFirst()) {
                val emailIndex = cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Email.ADDRESS)
                return cursor.getString(emailIndex)
            }
        }

        return null
    }
}
