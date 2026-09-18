package com.example.cpen321application.network

import java.net.NetworkInterface
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import kotlin.math.abs

fun getClientPrivateIp(): String {
    val interfaces = NetworkInterface.getNetworkInterfaces() ?: return "unknown"
    val address = interfaces.toList()
        .flatMap { it.inetAddresses.toList() }
        .firstOrNull { !it.isLoopbackAddress && !it.isLinkLocalAddress }
    return address?.hostAddress?.substringBefore('%') ?: "unknown"
}

private val TIME_FORMATTER: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm:ss")

fun getClientFormattedTime(): String {
    val now = OffsetDateTime.now()
    val timeStr = now.format(TIME_FORMATTER)
    val offsetSeconds = now.offset.totalSeconds
    val sign = if (offsetSeconds >= 0) "+" else "-"
    val absSeconds = abs(offsetSeconds)
    val hours = absSeconds / 3600
    val minutes = (absSeconds % 3600) / 60
    return "$timeStr GMT$sign${"%02d".format(hours)}:${"%02d".format(minutes)}"
}
