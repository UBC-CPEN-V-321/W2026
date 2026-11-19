package com.example.cpen321application.feature.profile

import com.example.cpen321application.core.network.dto.FriendDto
import com.example.cpen321application.core.network.dto.FriendGameDto
import com.google.gson.Gson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FriendStatusTextTest {
    // Input: a friend from GET /friends who is in a singles game in progress
    // Expected output: the game is read from the JSON, and the row says where they are playing
    @Test
    fun playingFriendShowsTheirGame() {
        val json = """{ "id": "u2", "username": "rally", "name": "Rally Partner", "rating": 1520,
            "friendsSince": "2026-10-01T12:00:00.000Z",
            "playing": { "gameId": "game-1", "format": "SINGLES", "startedAt": "2026-11-19T20:00:00.000Z",
            "courtName": "Kitsilano Beach Park" } }"""

        val friend = Gson().fromJson(json, FriendDto::class.java)

        assertEquals("game-1", friend.playing?.gameId)
        assertEquals("Playing singles now at Kitsilano Beach Park", friendStatusText(friend))
    }

    // Input: friends who aren't playing, with and without a rating
    // Expected output: their rating, or nothing
    @Test
    fun friendNotPlayingShowsTheirRating() {
        assertEquals("Rating 1520", friendStatusText(FriendDto("u2", "rally", elo = 1520, playing = null)))
        assertNull(friendStatusText(FriendDto("u3", "lob")))
    }

    // Input: a friend playing doubles
    // Expected output: the format is in lowercase
    @Test
    fun doublesIsLowercase() {
        val friend = FriendDto(
            "u2",
            "rally",
            playing = FriendGameDto("game-2", "DOUBLES", "2026-11-19T20:00:00.000Z", "Stanley Park")
        )

        assertEquals("Playing doubles now at Stanley Park", friendStatusText(friend))
    }
}
