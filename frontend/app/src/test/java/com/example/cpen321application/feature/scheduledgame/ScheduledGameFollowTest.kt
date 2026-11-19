package com.example.cpen321application.feature.scheduledgame

import com.example.cpen321application.core.data.model.Court
import com.example.cpen321application.core.data.model.Format
import com.example.cpen321application.core.data.model.Game
import com.example.cpen321application.core.data.model.GameSource
import com.example.cpen321application.core.data.model.GameStatus
import com.example.cpen321application.core.data.model.Tournament
import com.example.cpen321application.core.data.model.TournamentCreator
import com.example.cpen321application.core.data.model.TournamentStatus
import com.example.cpen321application.core.data.repository.GameListUpdate
import com.example.cpen321application.core.data.repository.GameListUpdates
import com.example.cpen321application.core.data.repository.GameUpdate
import com.example.cpen321application.core.data.repository.GamesRepository
import com.example.cpen321application.core.data.repository.TournamentsRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException
import java.time.Duration
import java.time.Instant

// The stream is the only source the tests follow; the one-off loads aren't used
private object UnusedGames : GamesRepository {
    override fun gameUpdates(gameId: String): Flow<GameUpdate> = error("unused")
    override suspend fun getFeed(): Result<List<Game>> = error("unused")
    override suspend fun getMyGames(): Result<List<Game>> = error("unused")
    override suspend fun getGame(gameId: String): Result<Game> = error("unused")
    override suspend fun createGame(format: Format, startsAt: Instant, courtId: Int): Result<String> = error("unused")
    override suspend fun cancelGame(gameId: String): Result<Unit> = error("unused")
    override suspend fun joinGame(gameId: String, team: Int): Result<Unit> = error("unused")
    override suspend fun leaveGame(gameId: String): Result<Unit> = error("unused")
    override suspend fun acceptMatch(gameId: String): Result<Unit> = error("unused")
    override suspend fun inviteFriend(gameId: String, userId: String): Result<Boolean> = error("unused")
    override suspend fun startGame(gameId: String): Result<Unit> = error("unused")
    override suspend fun changeGameTime(gameId: String, startsAt: Instant): Result<Unit> = error("unused")
    override suspend fun changeGameLocation(gameId: String, courtId: Int): Result<Unit> = error("unused")
    override suspend fun reportScore(gameId: String, rounds: List<Pair<Int, Int>>): Result<Unit> = error("unused")
}

private object UnusedTournaments : TournamentsRepository {
    override fun tournamentUpdates(tournamentId: String): Flow<Tournament> = error("unused")
    override suspend fun getFeed(): Result<List<Tournament>> = error("unused")
    override suspend fun getMyTournaments(): Result<List<Tournament>> = error("unused")
    override suspend fun getTournament(tournamentId: String): Result<Tournament> = error("unused")
    override suspend fun createTournament(
        name: String,
        format: Format,
        startsAt: Instant,
        courtId: Int
    ): Result<String> =
        error("unused")
    override suspend fun joinTournament(tournamentId: String): Result<Unit> = error("unused")
    override suspend fun leaveTournament(tournamentId: String): Result<Unit> = error("unused")
    override suspend fun cancelTournament(tournamentId: String): Result<Unit> = error("unused")
}

private class FakeGameListUpdates(private val stream: Flow<GameListUpdate>) : GameListUpdates {
    override fun updates(): Flow<GameListUpdate> = stream
}

class ScheduledGameFollowTest {
    private val court = Court(1, "Stanley Park", 49.3, -123.14)

    private fun game(id: String) = Game(
        id = id,
        format = Format.SINGLES,
        status = GameStatus.OPEN,
        source = GameSource.SCHEDULED,
        startsAt = Instant.now().plus(Duration.ofHours(2)),
        court = court,
        players = emptyList(),
        rounds = emptyList()
    )

    private val tournament = Tournament(
        id = "t1",
        name = "Sunday Smash",
        format = Format.SINGLES,
        status = TournamentStatus.REGISTRATION,
        startsAt = Instant.now().plus(Duration.ofDays(1)),
        court = court,
        creator = TournamentCreator("u1", "alice", "Alice A", 1500.0),
        capacity = 8,
        players = emptyList()
    )

    private fun viewModel(stream: Flow<GameListUpdate>) =
        ScheduledGameViewModel(UnusedGames, UnusedTournaments, { "alice" }, FakeGameListUpdates(stream))

    // Input: the tab opens (loading), then the backend pushes the feed, then the user's own lists, then a new feed
    // Expected output: each list is replaced by its latest push, the other kept; no longer loading; the user is known
    @Test(timeout = 10_000)
    fun pushedListsAreShown() = runTest {
        val viewModel = viewModel(
            flowOf(
                GameListUpdate.Feed(listOf(game("g1")), listOf(tournament)),
                GameListUpdate.Mine(listOf(game("g2")), emptyList()),
                GameListUpdate.Feed(listOf(game("g1"), game("g3")), emptyList())
            )
        )
        assertTrue(viewModel.uiState.value.isLoading)

        viewModel.followLists()

        val state = viewModel.uiState.value
        assertEquals(listOf("g1", "g3"), state.feed.map { it.id })
        assertEquals(emptyList<Tournament>(), state.tournamentFeed)
        assertEquals(listOf("g2"), state.myGames.map { it.id })
        assertFalse(state.isLoading)
        assertNull(state.errorMessage)
        assertEquals("alice", state.username)
    }

    // Input: the first connection drops, the second pushes the feed
    // Expected behavior: it reconnects after the delay (virtual time here)
    // Expected output: two connections, and the feed shown
    @Test(timeout = 10_000)
    fun reconnectsAfterADroppedConnection() = runTest {
        var connections = 0
        val viewModel = viewModel(
            flow {
                if (connections++ == 0) throw IOException("connection dropped")
                emit(GameListUpdate.Feed(listOf(game("g1")), emptyList()))
            }
        )

        viewModel.followLists()

        assertEquals(2, connections)
        assertEquals(listOf("g1"), viewModel.uiState.value.feed.map { it.id })
    }

    // Input: the backend refuses the stream with 401 (the token couldn't be refreshed)
    // Expected output: it stops loading and shows the error, without crashing
    @Test(timeout = 10_000)
    fun refusedStreamShowsTheError() = runTest {
        val viewModel = viewModel(flow { throw HttpException(Response.error<Unit>(401, "".toResponseBody())) })

        viewModel.followLists()

        assertFalse(viewModel.uiState.value.isLoading)
        assertEquals("Request failed (HTTP 401)", viewModel.uiState.value.errorMessage)
    }
}
