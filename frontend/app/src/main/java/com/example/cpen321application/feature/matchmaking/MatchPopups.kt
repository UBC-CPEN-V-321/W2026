package com.example.cpen321application.feature.matchmaking

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import com.example.cpen321application.core.notifications.MatchEvents
import kotlinx.coroutines.launch

/**
 * Shows the match pop-up over whichever screen is open, so a match found while the player is on
 * another tab still pops up. It follows match pushes and the app coming back instead of polling.
 * @param username the signed-in user, to tell which side of the match they are on
 * @param onGoToGame opens the matched game's screen
 */
@Composable
fun MatchPopups(
    viewModel: MatchmakingViewModel,
    username: String,
    onGoToGame: (gameId: String) -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val scope = rememberCoroutineScope()

    // On first open and every return to the app: pushes that arrived while it was in the background,
    // or never arrived, are caught up here
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        scope.launch { viewModel.refresh() }
    }

    // A match was found, accepted or cancelled while the app is open. Stops on sign-out.
    LaunchedEffect(Unit) {
        MatchEvents.events.collect { viewModel.refresh() }
    }

    val match = uiState.match
    if (match != null) {
        MatchDialog(
            match = match,
            prompt = matchPrompt(match, username),
            isAnswering = uiState.isAnswering,
            errorMessage = uiState.errorMessage,
            onAccept = { scope.launch { viewModel.onAccept() } },
            onCancel = { scope.launch { viewModel.onCancelMatch() } },
            onGoToGame = {
                viewModel.onGoToGame()
                onGoToGame(match.id)
            }
        )
    }

    if (uiState.matchFellThrough) {
        MatchFellThroughDialog(onDismiss = viewModel::onMatchFellThroughSeen)
    }
}
