package com.example.cpen321application.core.network.dto

import com.google.gson.annotations.SerializedName

data class FriendDto(
    @SerializedName("userId", alternate = ["id", "_id"])
    val userId: String,
    val username: String,
    val elo: Int? = null,
    val avatarUrl: String? = null,
    // The game the friend is playing right now, null if they aren't playing
    val playing: FriendGameDto? = null,
)

// A friend's game in progress, from GET /friends
data class FriendGameDto(
    val gameId: String,
    val format: String,
    val startedAt: String,
    val courtName: String,
)
