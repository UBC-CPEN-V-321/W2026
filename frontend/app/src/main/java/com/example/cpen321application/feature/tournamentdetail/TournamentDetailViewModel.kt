package com.example.cpen321application.feature.tournamentdetail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.core.data.model.Tournament
import com.example.cpen321application.core.data.repository.TournamentsRepository
import com.example.cpen321application.core.network.toUserMessage
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.retryWhen
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import retrofit2.HttpException
import java.io.IOException
import java.time.Instant

// Wait before reconnecting to the tournament's event stream, so a backend that is down isn't hammered
private const val RECONNECT_DELAY_MS = 3_000L

/**
 * One tournament's screen: its registrants or bracket, and joining, leaving or cancelling it
 * @param tournamentId the tournament on screen
 * @param tournamentsRepository the /tournaments routes
 * @param currentUsername the signed-in user's username, null if signed out
 */
class TournamentDetailViewModel(
    private val tournamentId: String,
    private val tournamentsRepository: TournamentsRepository,
    private val currentUsername: () -> String?
) : ViewModel() {
    private val _uiState = MutableStateFlow(TournamentDetailUiState())
    val uiState: StateFlow<TournamentDetailUiState> = _uiState.asStateFlow()

    init {
        // The screen opens the tournament's event stream (followUpdates), which sends the tournament first,
        // so it isn't loaded here too
        _uiState.update { it.copy(isLoading = true) }
    }

    /**
     * Loads the tournament again, for Retry after an error
     */
    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            reload()
            _uiState.update { it.copy(isLoading = false) }
        }
    }

    fun join() = sendAction { tournamentsRepository.joinTournament(tournamentId) }

    fun leave() = sendAction { tournamentsRepository.leaveTournament(tournamentId) }

    /**
     * Cancels the tournament for every player
     * @param onCancelled called once the tournament is cancelled, to leave its screen
     */
    fun cancel(onCancelled: () -> Unit) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, errorMessage = null) }
            tournamentsRepository.cancelTournament(tournamentId)
                .onSuccess {
                    _uiState.update { it.copy(isSaving = false) }
                    onCancelled()
                }
                .onFailure { error ->
                    _uiState.update { it.copy(isSaving = false, errorMessage = error.toUserMessage()) }
                }
        }
    }

    private fun sendAction(action: suspend () -> Result<Unit>) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, errorMessage = null) }
            action()
                .onSuccess { reload() }
                .onFailure { error ->
                    _uiState.update { it.copy(errorMessage = error.toUserMessage()) }
                }
            _uiState.update { it.copy(isSaving = false) }
        }
    }

    /**
     * Shows each change to the tournament as the backend pushes it (players joining or leaving, the bracket being
     * drawn, matches started or scored), until the caller stops collecting. Reconnects after the connection drops;
     * the backend sends the current tournament on every connect, so changes made while disconnected aren't missed
     */
    suspend fun followUpdates() {
        tournamentsRepository.tournamentUpdates(tournamentId)
            .retryWhen { cause, _ ->
                val reconnect = cause is IOException
                if (reconnect) delay(RECONNECT_DELAY_MS)
                reconnect
            }
            .catch { error ->
                if (error !is HttpException) throw error
                // The backend refused the stream, e.g. the tournament is gone: the screen keeps what it showed
                _uiState.update { it.copy(isLoading = false, errorMessage = error.toUserMessage()) }
            }
            .collect { tournament ->
                showTournament(tournament)
                _uiState.update { it.copy(isLoading = false) }
            }
    }

    private fun showTournament(tournament: Tournament) {
        val actions = tournamentActions(tournament, currentUsername(), Instant.now())
        _uiState.update { it.copy(tournament = tournament, actions = actions) }
    }

    private suspend fun reload() {
        tournamentsRepository.getTournament(tournamentId)
            .onSuccess(::showTournament)
            .onFailure { error ->
                _uiState.update { it.copy(errorMessage = error.toUserMessage()) }
            }
    }
}
