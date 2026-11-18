package com.exploreUBC.cpen321application.testutil

import java.net.ServerSocket
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.concurrent.thread

/** Minimal HTTP server that answers every request with one fixed response, for API client tests. */
internal class LocalHttpServer(private val status: Int, private val body: String) : AutoCloseable {
    private val socket = ServerSocket(0)
    val requestLines = CopyOnWriteArrayList<String>()
    val baseUrl: String = "http://127.0.0.1:${socket.localPort}"

    init {
        thread(isDaemon = true) {
            while (!socket.isClosed) {
                runCatching {
                    socket.accept().use { client ->
                        val reader = client.getInputStream().bufferedReader()
                        requestLines.add(reader.readLine().orEmpty())
                        while (reader.readLine().orEmpty().isNotEmpty()) { /* skip headers */ }
                        val bytes = body.toByteArray()
                        val head = "HTTP/1.1 $status Status\r\nContent-Type: application/json\r\n" +
                            "Content-Length: ${bytes.size}\r\nConnection: close\r\n\r\n"
                        client.getOutputStream().apply {
                            write(head.toByteArray())
                            write(bytes)
                            flush()
                        }
                    }
                }
            }
        }
    }

    override fun close() = socket.close()
}
