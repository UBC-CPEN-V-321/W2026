package com.example.cpen321application.ui.button1

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.example.cpen321application.auth.signInWithGoogle
import com.example.cpen321application.network.fetchButton1BackendInfo
import com.example.cpen321application.network.getClientFormattedTime
import com.example.cpen321application.network.getClientPrivateIp
import java.io.IOException
import kotlinx.coroutines.launch

private data class Button1UiState(
    val isLoading: Boolean = false,
    val error: String? = null,
    val signedInUserName: String? = null,
    val serverIp: String? = null,
    val clientIp: String? = null,
    val serverTime: String? = null,
    val clientTime: String? = null,
    val developerName: String? = null
) {
    val isSignedIn: Boolean get() = signedInUserName != null
}

@Composable
fun Button1Screen(apiBaseUrl: String, googleClientId: String, onBack: () -> Unit, modifier: Modifier = Modifier) {
    var uiState by remember { mutableStateOf(Button1UiState()) }
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    fun signInAndLoad() {
        uiState = uiState.copy(isLoading = true, error = null)
        coroutineScope.launch {
            val userResult = signInWithGoogle(context, googleClientId)
            val user = userResult.getOrNull()
            if (user == null) {
                uiState = uiState.copy(
                    isLoading = false,
                    error = "Sign-in failed. Please try again."
                )
                return@launch
            }

            val signedInName = listOfNotNull(user.givenName, user.familyName)
                .joinToString(" ")
                .ifBlank { user.displayName ?: user.email ?: "Unknown user" }

            try {
                val backendInfo = fetchButton1BackendInfo(apiBaseUrl, user.idToken)
                uiState = uiState.copy(
                    isLoading = false,
                    error = null,
                    signedInUserName = signedInName,
                    serverIp = backendInfo.serverIp,
                    clientIp = getClientPrivateIp(),
                    serverTime = backendInfo.serverTime,
                    clientTime = getClientFormattedTime(),
                    developerName = backendInfo.developerName
                )
            } catch (e: IOException) {
                uiState = uiState.copy(
                    isLoading = false,
                    error = "Couldn't reach the server. Please try again.",
                    signedInUserName = signedInName
                )
            }
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

        if (!uiState.isSignedIn) {
            Button(onClick = { signInAndLoad() }, modifier = Modifier.fillMaxWidth()) {
                Text("Sign in with Google")
            }
        }

        if (uiState.isLoading) {
            CircularProgressIndicator()
        }

        uiState.error?.let { error ->
            Text(text = error)
        }

        if (uiState.isSignedIn) {
            Card(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Server IP address: ${uiState.serverIp ?: "-"}")
                    Text("Client IP address: ${uiState.clientIp ?: "-"}")
                    Text("Server local time: ${uiState.serverTime ?: "-"}")
                    Text("Client local time: ${uiState.clientTime ?: "-"}")
                    Text("Your name: ${uiState.developerName ?: "-"}")
                    Text("Logged in as: ${uiState.signedInUserName ?: "-"}")
                }
            }
        }
    }
}
