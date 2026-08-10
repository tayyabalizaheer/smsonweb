package com.example.smssync

data class SmsRecord(
    val deviceMessageId: String,
    val address: String,
    val contactName: String?,
    val contactEmail: String?,
    val body: String,
    val direction: String,
    val messageAtMillis: Long
)
