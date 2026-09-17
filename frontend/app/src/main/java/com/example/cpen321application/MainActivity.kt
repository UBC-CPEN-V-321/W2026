package com.example.cpen321application

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.cpen321application.ui.button1.Button1Screen
import com.example.cpen321application.ui.button2.Button2Screen
import com.example.cpen321application.ui.theme.CPEN321ApplicationTheme

private enum class Screen { HOME, BUTTON1, BUTTON2 }

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            CPEN321ApplicationTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    AppRoot(modifier = Modifier.padding(innerPadding))
                }
            }
        }
    }
}

@Composable
private fun AppRoot(modifier: Modifier = Modifier) {
    var screen by remember { mutableStateOf(Screen.HOME) }

    when (screen) {
        Screen.HOME -> HomeScreen(
            onButton1Click = { screen = Screen.BUTTON1 },
            onButton2Click = { screen = Screen.BUTTON2 },
            modifier = modifier
        )
        Screen.BUTTON1 -> Button1Screen(
            apiBaseUrl = BuildConfig.API_BASE_URL,
            googleClientId = BuildConfig.GOOGLE_CLIENT_ID,
            onBack = { screen = Screen.HOME },
            modifier = modifier
        )
        Screen.BUTTON2 -> Button2Screen(
            apiBaseUrl = BuildConfig.API_BASE_URL,
            onBack = { screen = Screen.HOME },
            modifier = modifier
        )
    }
}

@Composable
private fun HomeScreen(
    onButton1Click: () -> Unit,
    onButton2Click: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Button(onClick = onButton1Click, modifier = Modifier.fillMaxWidth()) {
            Text("Login + Server")
        }
        Button(onClick = onButton2Click, modifier = Modifier.fillMaxWidth()) {
            Text("Live Updates")
        }
        Button(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) {
            Text("Timer")
        }
    }
}
