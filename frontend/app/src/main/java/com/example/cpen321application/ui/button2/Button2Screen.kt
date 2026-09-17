package com.example.cpen321application.ui.button2

import android.os.Handler
import android.os.Looper
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject

private const val GRID_SIZE = 16
private val BLANK_CELL_COLOR = Color.White

@Composable
fun Button2Screen(apiBaseUrl: String, onBack: () -> Unit, modifier: Modifier = Modifier) {
    val cells = remember { mutableStateListOf(*Array(GRID_SIZE * GRID_SIZE) { BLANK_CELL_COLOR }) }
    var connectionError by remember { mutableStateOf<String?>(null) }

    DisposableEffect(apiBaseUrl) {
        val socket: Socket = IO.socket(apiBaseUrl)
        val mainHandler = Handler(Looper.getMainLooper())

        socket.on("pixel") { args ->
            val payload = args.getOrNull(0) as? JSONObject ?: return@on
            val x = payload.optInt("x", -1)
            val y = payload.optInt("y", -1)
            val colorHex = payload.optString("color", "")
            if (x !in 0 until GRID_SIZE || y !in 0 until GRID_SIZE || colorHex.isEmpty()) return@on

            mainHandler.post {
                cells[y * GRID_SIZE + x] = Color(android.graphics.Color.parseColor(colorHex))
            }
        }
        socket.on(Socket.EVENT_CONNECT_ERROR) { args ->
            mainHandler.post {
                connectionError = "Live updates connection failed: ${args.getOrNull(0)}"
            }
        }
        socket.connect()

        onDispose {
            socket.off()
            socket.disconnect()
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        OutlinedButton(onClick = onBack) {
            Text("Back")
        }

        connectionError?.let { error ->
            Text(text = error)
        }

        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
        ) {
            val cellSize = Size(size.width / GRID_SIZE, size.height / GRID_SIZE)
            for (y in 0 until GRID_SIZE) {
                for (x in 0 until GRID_SIZE) {
                    drawRect(
                        color = cells[y * GRID_SIZE + x],
                        topLeft = Offset(x * cellSize.width, y * cellSize.height),
                        size = cellSize
                    )
                }
            }
        }
    }
}
