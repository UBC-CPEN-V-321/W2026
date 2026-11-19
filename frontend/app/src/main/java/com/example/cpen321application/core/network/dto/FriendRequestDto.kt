package com.example.cpen321application.core.network.dto

import com.google.gson.annotations.SerializedName

data class FriendRequestDto(
    @SerializedName("userId", alternate = ["id", "_id", "senderId", "fromUserId"])
    val userId: String,
    val username: String,
    val createdAt: String? = null,
    // Their real name, e.g. "Chance Test"; the username is their sign-up email
    val name: String? = null,
) {
    // The name to show, or the username if they have no name
    val displayName: String get() = name?.takeIf { it.isNotBlank() } ?: username
}
