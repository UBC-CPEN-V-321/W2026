package com.example.cpen321application.core.data.repository

import com.example.cpen321application.core.auth.AuthSession
import com.example.cpen321application.core.auth.User
import com.example.cpen321application.core.network.ApiService
import com.example.cpen321application.core.network.GamesApi
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

/**
 * GET /user/me and GET /friends as the backend really sends them: ratings are decimals
 */
class UserMeParsingTest {
    private val server = MockWebServer()

    @Before
    fun startServer() {
        server.start()
    }

    @After
    fun stopServer() {
        server.shutdown()
    }

    private fun repository(): Pair<FriendsRepositoryImpl, AuthSession> {
        val retrofit = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .addConverterFactory(GsonConverterFactory.create())
            .build()
        val api = retrofit.create(ApiService::class.java)
        val session = AuthSession(api, User("chance@example.com", "access", "refresh")) {}
        return FriendsRepositoryImpl(api, retrofit.create(GamesApi::class.java)) to session
    }

    // Input: the profile with a decimal rating that rounds up
    // Expected output: every field is read, including the name, and the rating is rounded (1584.6 → 1585),
    // like the leaderboard and game screens
    @Test
    fun profileKeepsTheNameAndRoundsTheRating() = runBlocking {
        server.enqueue(
            MockResponse().setBody(
                """{ "user": { "id": "u1", "username": "chance@example.com", "name": "Chance Test",
                "email": "chance@example.com", "createdAt": "2026-10-01T12:00:00.000Z", "rating": 1584.6 } }"""
            )
        )
        val (repository, session) = repository()

        val me = repository.getUserMe(session).getOrThrow()

        assertEquals("Chance Test", me.name)
        assertEquals("chance@example.com", me.username)
        assertEquals(1585, me.elo)
    }

    // Input: GET /friends with one friend whose decimal rating is under "rating"
    // Expected output: the friend's rating is read (it used to be looked for under "elo" and was always null)
    @Test
    fun friendRatingIsRead() = runBlocking {
        server.enqueue(
            MockResponse().setBody(
                """{ "friends": [ { "id": "u2", "username": "rally@example.com", "name": "Rally Partner",
                "rating": 1519.6, "friendsSince": "2026-10-01T12:00:00.000Z", "playing": null } ] }"""
            )
        )
        val (repository, session) = repository()

        val friend = repository.getFriends(session).getOrThrow().single()

        assertEquals(1519.6, friend.rating!!, 0.0)
        assertEquals("Rally Partner", friend.displayName)
    }
}
