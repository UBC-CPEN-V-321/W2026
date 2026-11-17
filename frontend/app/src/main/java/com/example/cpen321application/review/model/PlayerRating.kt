package com.example.cpen321application.review.model

import com.example.cpen321application.review.dto.PlayersToRateResponse
import java.util.Locale

// the most stars a rating category, and so a reputation score, can have
const val MAX_STARS = 6

// a reputation score as it reads everywhere, e.g. "4.7/6"
fun formatReputationScore(score: Double): String = String.format(Locale.US, "%.1f/%d", score, MAX_STARS)

// the categories of a rating, in the order the form shows them
enum class RatingCategory(val label: String) {
    Punctuality("Punctuality"),
    Sportsmanship("Sportsmanship"),
    Skill("Skill"),
    Reliability("Reliability"),
    Overall("Overall")
}

// a row on the Rate Players screen, isRated means the user already rated them
data class PlayerToRate(
    val userId: Int,
    val name: String,
    val initial: String,
    val isOrganizer: Boolean,
    val isRated: Boolean
)

// what the Rate Players screen shows once it loads
data class PlayersToRate(val gameTitle: String, val players: List<PlayerToRate>)

fun PlayersToRateResponse.toPlayersToRate() = PlayersToRate(
    gameTitle = gameTitle.orEmpty(),
    players = players.orEmpty().map { player ->
        PlayerToRate(
            userId = player.userId,
            name = "${player.firstName} ${player.lastName}".trim(),
            initial = player.firstName.take(1).uppercase(Locale.getDefault()),
            isOrganizer = player.userId == organizerId,
            isRated = player.rated
        )
    }
)
