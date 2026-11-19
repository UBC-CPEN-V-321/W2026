package com.example.cpen321application.core.data.repository

import com.example.cpen321application.core.auth.AuthSession
import com.example.cpen321application.core.data.model.Format
import com.example.cpen321application.core.data.model.Tournament
import com.example.cpen321application.core.network.EventStreamApi
import com.example.cpen321application.core.network.RetrofitClient
import com.example.cpen321application.core.network.ServerSentEvent
import com.example.cpen321application.core.network.TournamentApi
import com.example.cpen321application.core.network.dto.CreateTournamentRequestDto
import com.example.cpen321application.core.network.dto.TournamentIdRequestDto
import com.example.cpen321application.core.network.dto.TournamentResponseDto
import com.example.cpen321application.core.network.dto.toTournament
import com.google.gson.Gson
import com.google.gson.JsonParseException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.mapNotNull
import retrofit2.HttpException
import java.io.IOException
import java.time.Instant
import java.time.format.DateTimeFormatter

interface TournamentsRepository {
    // Tournaments open for registration that have not started, soonest first, with their forecast
    suspend fun getFeed(): Result<List<Tournament>>

    // The signed-in user's tournaments: open ones, ones in progress, and ones completed in the last 24 hours
    suspend fun getMyTournaments(): Result<List<Tournament>>

    // One tournament with its bracket
    suspend fun getTournament(tournamentId: String): Result<Tournament>

    // Creates a tournament with the signed-in user registered, and returns its ID
    suspend fun createTournament(name: String, format: Format, startsAt: Instant, courtId: Int): Result<String>

    // Registers the signed-in user. The backend draws the bracket when this fills the tournament
    suspend fun joinTournament(tournamentId: String): Result<Unit>

    suspend fun leaveTournament(tournamentId: String): Result<Unit>

    // Cancels the tournament for every player. Only its creator can, while registration is open
    suspend fun cancelTournament(tournamentId: String): Result<Unit>

    // The tournament pushed by the backend each time it changes (players join or leave, the bracket is drawn,
    // a match is started or scored, it is cancelled), starting with its current state. Ends right away if
    // signed out. Throws IOException if the connection drops, HttpException if the backend refuses
    fun tournamentUpdates(tournamentId: String): Flow<Tournament>
}

class TournamentsRepositoryImpl(
    private val session: AuthSession,
    private val api: TournamentApi = RetrofitClient.tournamentApi,
    private val eventStreamApi: EventStreamApi = RetrofitClient.eventStreamApi
) : TournamentsRepository {
    private val gson = Gson()

    override fun tournamentUpdates(tournamentId: String): Flow<Tournament> = flow {
        // A 401 when connecting makes authorized refresh the token and connect again
        session.authorized { authorization ->
            val query = mapOf("tournamentId" to tournamentId)
            emitAll(eventStreamApi.events(authorization, "tournaments/events", query).mapNotNull(::toTournament))
        }
    }

    // Null for events this version of the app doesn't know, or can't read
    private fun toTournament(event: ServerSentEvent): Tournament? =
        try {
            if (event.name == "tournamentUpdated") {
                gson.fromJson(event.data, TournamentResponseDto::class.java).tournament.toTournament()
            } else {
                null
            }
        } catch (e: JsonParseException) {
            null
        } catch (e: IllegalArgumentException) {
            null  // An enum value this version of the app doesn't know
        }

    override suspend fun getFeed(): Result<List<Tournament>> =
        request { api.getTournamentFeed(it).tournaments.map { tournament -> tournament.toTournament() } }

    override suspend fun getMyTournaments(): Result<List<Tournament>> =
        request { api.getMyTournaments(it).tournaments.map { tournament -> tournament.toTournament() } }

    override suspend fun getTournament(tournamentId: String): Result<Tournament> =
        request { api.getTournament(it, tournamentId).tournament.toTournament() }

    override suspend fun createTournament(
        name: String,
        format: Format,
        startsAt: Instant,
        courtId: Int
    ): Result<String> =
        request {
            val body = CreateTournamentRequestDto(
                name = name,
                format = format.name,
                // e.g. 2026-11-08T17:00:00Z. The backend requires a time zone, and UTC ("Z") is one
                startsAt = DateTimeFormatter.ISO_INSTANT.format(startsAt),
                courtId = courtId
            )
            api.createTournament(it, body).tournament.id
        }

    override suspend fun joinTournament(tournamentId: String): Result<Unit> =
        request { api.joinTournament(it, TournamentIdRequestDto(tournamentId)) }

    override suspend fun leaveTournament(tournamentId: String): Result<Unit> =
        request { api.leaveTournament(it, TournamentIdRequestDto(tournamentId)) }

    override suspend fun cancelTournament(tournamentId: String): Result<Unit> =
        request { api.cancelTournament(it, tournamentId) }

    private suspend fun <T> request(call: suspend (authorization: String) -> T): Result<T> {
        return try {
            val result = session.authorized(call)
            if (result == null) {
                // The app goes back to Login on its own once the user is signed out
                Result.failure(IllegalStateException("You are signed out."))
            } else {
                Result.success(result)
            }
        } catch (e: HttpException) {
            Result.failure(e)
        } catch (e: IOException) {
            Result.failure(e)
        }
    }
}
