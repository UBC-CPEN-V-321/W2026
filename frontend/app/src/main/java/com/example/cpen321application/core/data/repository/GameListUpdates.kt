package com.example.cpen321application.core.data.repository

import com.example.cpen321application.core.auth.AuthSession
import com.example.cpen321application.core.data.model.Game
import com.example.cpen321application.core.data.model.Tournament
import com.example.cpen321application.core.network.EventStreamApi
import com.example.cpen321application.core.network.RetrofitClient
import com.example.cpen321application.core.network.ServerSentEvent
import com.example.cpen321application.core.network.dto.GameDto
import com.example.cpen321application.core.network.dto.TournamentDto
import com.example.cpen321application.core.network.dto.toGame
import com.example.cpen321application.core.network.dto.toTournament
import com.google.gson.Gson
import com.google.gson.JsonParseException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.mapNotNull

// What the backend pushes about the Games tab
sealed interface GameListUpdate {
    val games: List<Game>
    val tournaments: List<Tournament>

    // Games and tournaments open to join, soonest first, with their forecast. The same for everyone
    data class Feed(override val games: List<Game>, override val tournaments: List<Tournament>) : GameListUpdate

    // The signed-in user's games and tournaments
    data class Mine(override val games: List<Game>, override val tournaments: List<Tournament>) : GameListUpdate
}

interface GameListUpdates {
    // The Games tab's lists pushed by the backend: both first, then each again whenever it changes (a game or
    // tournament created, joined, left, started, scored or cancelled, by anyone). Ends right away if signed out.
    // Throws IOException if the connection drops, HttpException if the backend refuses the stream
    fun updates(): Flow<GameListUpdate>
}

// The event's data: { games: [...], tournaments: [...] }, shaped like GET /games/feed and GET /tournaments/feed
private data class GameListDto(val games: List<GameDto>?, val tournaments: List<TournamentDto>?)

class GameListUpdatesImpl(
    private val session: AuthSession,
    private val eventStreamApi: EventStreamApi = RetrofitClient.eventStreamApi,
    private val gson: Gson = Gson()
) : GameListUpdates {
    override fun updates(): Flow<GameListUpdate> = flow {
        // A 401 when connecting makes authorized refresh the token and connect again
        session.authorized { authorization ->
            emitAll(eventStreamApi.events(authorization, "games/feed/events").mapNotNull(::toUpdate))
        }
    }

    // Null for events this version of the app doesn't know, or can't read
    private fun toUpdate(event: ServerSentEvent): GameListUpdate? =
        try {
            when (event.name) {
                "feed" -> parse(event.data).let { (games, tournaments) -> GameListUpdate.Feed(games, tournaments) }
                "mine" -> parse(event.data).let { (games, tournaments) -> GameListUpdate.Mine(games, tournaments) }
                else -> null
            }
        } catch (e: JsonParseException) {
            null
        } catch (e: IllegalArgumentException) {
            null  // An enum value this version of the app doesn't know
        }

    private fun parse(json: String): Pair<List<Game>, List<Tournament>> {
        val lists = gson.fromJson(json, GameListDto::class.java)
        return lists.games.orEmpty().map { it.toGame() } to lists.tournaments.orEmpty().map { it.toTournament() }
    }
}
