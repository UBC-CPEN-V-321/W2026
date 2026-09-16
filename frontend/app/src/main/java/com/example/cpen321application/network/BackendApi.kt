package com.example.cpen321application.network

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

data class Button1BackendInfo(val serverIp: String, val serverTime: String, val developerName: String)

suspend fun fetchButton1BackendInfo(apiBaseUrl: String): Button1BackendInfo {
    val base = apiBaseUrl.trimEnd('/')
    val ip = fetchJson("$base/api/server-ip").getString("ip")
    val time = fetchJson("$base/api/server-time").getString("time")
    val name = fetchJson("$base/api/name")
    val first = name.getString("first")
    val last = name.getString("last")
    return Button1BackendInfo(
        serverIp = ip,
        serverTime = time,
        developerName = "$first $last".trim()
    )
}

private suspend fun fetchJson(url: String): JSONObject = withContext(Dispatchers.IO) {
    val connection = (URL(url).openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        connectTimeout = 5_000
        readTimeout = 5_000
    }
    val code = connection.responseCode
    if (code != HttpURLConnection.HTTP_OK) {
        throw IOException("GET $url failed with HTTP $code")
    }
    val body = connection.inputStream.bufferedReader().use { it.readText() }
    JSONObject(body)
}
