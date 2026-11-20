package com.example.cpen321application.core.data.repository

import com.example.cpen321application.core.auth.AuthSession
import com.example.cpen321application.core.data.model.Game
import com.example.cpen321application.core.network.ApiService
import com.example.cpen321application.core.network.GamesApi
import com.example.cpen321application.core.network.RetrofitClient
import com.example.cpen321application.core.network.dto.AcceptFriendRequestDto
import com.example.cpen321application.core.network.dto.FriendDto
import com.example.cpen321application.core.network.dto.FriendRequestDto
import com.example.cpen321application.core.network.dto.SendFriendRequestDto
import com.example.cpen321application.core.network.dto.UserMeDto
import com.example.cpen321application.core.network.dto.toGame
import com.google.gson.Gson
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.reflect.TypeToken
import retrofit2.HttpException
import java.io.IOException
import kotlin.math.roundToInt

interface FriendsRepository {
    suspend fun getUserMe(session: AuthSession): Result<UserMeDto>
    suspend fun getFriends(session: AuthSession): Result<List<FriendDto>>
    suspend fun removeFriend(session: AuthSession, userId: String): Result<Unit>
    suspend fun getFriendRequests(session: AuthSession): Result<List<FriendRequestDto>>
    suspend fun acceptFriendRequest(session: AuthSession, userId: String): Result<Unit>

    // The requests the signed-in user sent that are still pending
    suspend fun getOutgoingFriendRequests(session: AuthSession): Result<List<FriendRequestDto>>

    // Sends a friend request. If the other user already sent one, the backend accepts theirs instead
    suspend fun sendFriendRequest(session: AuthSession, userId: String): Result<Unit>

    // The signed-in user's completed games, most recent first
    suspend fun getMatchHistory(session: AuthSession): Result<List<Game>>

    // Fetches the user's profile photo URL from GET users/:userId/photo
    suspend fun getUserPhoto(session: AuthSession, userId: String): Result<String?>
}

class FriendsRepositoryImpl(
    private val apiService: ApiService = RetrofitClient.apiService,
    private val gamesApi: GamesApi = RetrofitClient.gamesApi,
    private val gson: Gson = Gson()
) : FriendsRepository {

    override suspend fun getUserMe(session: AuthSession): Result<UserMeDto> {
        return try {
            val jsonElement = session.authorized { auth ->
                apiService.getUserMe(auth)
            }
            val userMe = parseUserMe(jsonElement)
            if (userMe != null) {
                Result.success(userMe)
            } else {
                Result.failure(Exception("Failed to parse user profile"))
            }
        } catch (e: HttpException) {
            Result.failure(e)
        } catch (e: IOException) {
            Result.failure(e)
        }
    }

    override suspend fun getFriends(session: AuthSession): Result<List<FriendDto>> {
        return try {
            val jsonElement = session.authorized { auth ->
                apiService.getFriends(auth)
            }
            val friends = parseFlexibleList<FriendDto>(jsonElement, "friends")
            Result.success(friends)
        } catch (e: HttpException) {
            Result.failure(e)
        } catch (e: IOException) {
            Result.failure(e)
        }
    }

    override suspend fun removeFriend(session: AuthSession, userId: String): Result<Unit> {
        return try {
            val response = session.authorized { auth ->
                apiService.removeFriend(auth, userId)
            }
            if (response != null && response.isSuccessful) {
                Result.success(Unit)
            } else if (response != null) {
                Result.failure(HttpException(response))
            } else {
                Result.failure(Exception("Not authenticated"))
            }
        } catch (e: HttpException) {
            Result.failure(e)
        } catch (e: IOException) {
            Result.failure(e)
        }
    }

    override suspend fun getFriendRequests(session: AuthSession): Result<List<FriendRequestDto>> {
        return try {
            val jsonElement = session.authorized { auth ->
                apiService.getFriendRequests(auth)
            }
            // The backend sends { incoming, outgoing }; this list is the requests to accept
            val requests = parseFlexibleList<FriendRequestDto>(jsonElement, "incoming", "requests", "friendRequests")
            Result.success(requests)
        } catch (e: HttpException) {
            Result.failure(e)
        } catch (e: IOException) {
            Result.failure(e)
        }
    }

    override suspend fun acceptFriendRequest(session: AuthSession, userId: String): Result<Unit> {
        return try {
            val response = session.authorized { auth ->
                apiService.acceptFriendRequest(auth, AcceptFriendRequestDto(userId))
            }
            if (response != null && response.isSuccessful) {
                Result.success(Unit)
            } else if (response != null) {
                Result.failure(HttpException(response))
            } else {
                Result.failure(Exception("Not authenticated"))
            }
        } catch (e: HttpException) {
            Result.failure(e)
        } catch (e: IOException) {
            Result.failure(e)
        }
    }

    override suspend fun getOutgoingFriendRequests(session: AuthSession): Result<List<FriendRequestDto>> {
        return try {
            val jsonElement = session.authorized { auth ->
                apiService.getFriendRequests(auth)
            }
            val outgoing = jsonElement
                ?.takeIf { it.isJsonObject }
                ?.asJsonObject
                ?.get("outgoing")
                ?.takeIf { it.isJsonArray }
            val requests: List<FriendRequestDto> = if (outgoing == null) {
                emptyList()
            } else {
                gson.fromJson(outgoing, object : TypeToken<List<FriendRequestDto>>() {}.type)
            }
            Result.success(requests)
        } catch (e: HttpException) {
            Result.failure(e)
        } catch (e: IOException) {
            Result.failure(e)
        }
    }

    override suspend fun sendFriendRequest(session: AuthSession, userId: String): Result<Unit> {
        return try {
            val response = session.authorized { auth ->
                apiService.sendFriendRequest(auth, SendFriendRequestDto(userId))
            }
            if (response != null && response.isSuccessful) {
                Result.success(Unit)
            } else if (response != null) {
                Result.failure(HttpException(response))
            } else {
                Result.failure(Exception("Not authenticated"))
            }
        } catch (e: HttpException) {
            Result.failure(e)
        } catch (e: IOException) {
            Result.failure(e)
        }
    }

    override suspend fun getMatchHistory(session: AuthSession): Result<List<Game>> {
        return try {
            val response = session.authorized { auth ->
                gamesApi.getGameHistory(auth)
            }
            if (response == null) {
                Result.failure(Exception("Not authenticated"))
            } else {
                Result.success(response.games.map { it.toGame() })
            }
        } catch (e: HttpException) {
            Result.failure(e)
        } catch (e: IOException) {
            Result.failure(e)
        }
    }

    override suspend fun getUserPhoto(session: AuthSession, userId: String): Result<String?> {
        return try {
            val jsonElement = session.authorized { auth ->
                apiService.getUserPhoto(auth, userId)
            }
            val photoUrl = parsePhotoUrl(jsonElement)
            Result.success(photoUrl)
        } catch (e: HttpException) {
            Result.failure(e)
        } catch (e: IOException) {
            Result.failure(e)
        }
    }

    private fun parseUserMe(jsonElement: JsonElement?): UserMeDto? {
        if (jsonElement == null || jsonElement.isJsonNull) return null

        if (jsonElement.isJsonObject) {
            val obj = jsonElement.asJsonObject

            val targetObj = when {
                obj.has("user") && obj.get("user").isJsonObject -> obj.getAsJsonObject("user")
                obj.has("me") && obj.get("me").isJsonObject -> obj.getAsJsonObject("me")
                obj.has("data") && obj.get("data").isJsonObject -> obj.getAsJsonObject("data")
                else -> obj
            }

            val directDto = try {
                gson.fromJson(targetObj, UserMeDto::class.java)
            } catch (_: Exception) {
                null
            }

            val eloVal = directDto?.elo ?: extractElo(targetObj)
            val idVal = directDto?.id ?: listOf("id", "userId", "_id").firstNotNullOfOrNull { key ->
                if (targetObj.has(key) && !targetObj.get(key).isJsonNull) targetObj.get(key).asString else null
            }
            val usernameVal = directDto?.username ?: listOf("username", "name").firstNotNullOfOrNull { key ->
                if (targetObj.has(key) && !targetObj.get(key).isJsonNull) targetObj.get(key).asString else null
            }
            val emailVal = directDto?.email ?: if (targetObj.has("email") && !targetObj.get("email").isJsonNull) targetObj.get("email").asString else null
            val photoUrlVal = directDto?.avatarUrl ?: parsePhotoUrl(targetObj)

            return UserMeDto(id = idVal, username = usernameVal, name = directDto?.name, email = emailVal, elo = eloVal, avatarUrl = photoUrlVal)
        }

        return null
    }

    private fun parsePhotoUrl(jsonElement: JsonElement?): String? {
        if (jsonElement == null || jsonElement.isJsonNull) return null

        if (jsonElement.isJsonPrimitive) {
            val str = jsonElement.asString.trim()
            return if (str.startsWith("http://") || str.startsWith("https://")) str else null
        }

        if (jsonElement.isJsonObject) {
            val obj = jsonElement.asJsonObject
            val targetObj = when {
                obj.has("data") && obj.get("data").isJsonObject -> obj.getAsJsonObject("data")
                obj.has("user") && obj.get("user").isJsonObject -> obj.getAsJsonObject("user")
                obj.has("photo") && obj.get("photo").isJsonObject -> obj.getAsJsonObject("photo")
                else -> obj
            }

            val keys = listOf("photoUrl", "url", "photo", "picture", "avatarUrl", "imageUrl", "googleImage", "link")
            for (key in keys) {
                if (targetObj.has(key) && !targetObj.get(key).isJsonNull) {
                    val elem = targetObj.get(key)
                    if (elem.isJsonPrimitive) {
                        val str = elem.asString.trim()
                        if (str.startsWith("http://") || str.startsWith("https://")) {
                            return str
                        }
                    }
                }
            }
        }

        return null
    }

    private val ELO_KEYS = listOf("elo", "rating", "eloRating", "rankRating")

    private fun extractElo(obj: JsonObject): Int? {
        val elem = ELO_KEYS
            .firstNotNullOfOrNull { key -> obj.get(key)?.takeUnless { it.isJsonNull } }
            ?: return null
        return parseEloElement(elem)
    }

    // Rounded like the leaderboard and game screens (1584.6 → 1585). asInt would cut it to 1584
    private fun parseEloElement(elem: JsonElement): Int? =
        runCatching { elem.asDouble.roundToInt() }.getOrNull()
            ?: runCatching { elem.asString.toDoubleOrNull()?.roundToInt() }.getOrNull()

    private inline fun <reified T> parseFlexibleList(
        jsonElement: JsonElement?,
        vararg preferredKeys: String
    ): List<T> {
        if (jsonElement == null || jsonElement.isJsonNull) return emptyList()

        val type = object : TypeToken<List<T>>() {}.type

        // Case 1: Direct JSON Array e.g. [ {...}, {...} ]
        if (jsonElement.isJsonArray) {
            return gson.fromJson(jsonElement, type) ?: emptyList()
        }

        // Case 2: JSON Object wrapper e.g. { "friends": [ ... ] } or { "data": [ ... ] }
        if (jsonElement.isJsonObject) {
            val obj = jsonElement.asJsonObject

            // Check preferred keys first ("friends", "requests", "matches", etc.)
            val candidateKeys = preferredKeys.toList() + listOf("data", "items", "results", "list")
            for (key in candidateKeys) {
                if (obj.has(key) && obj.get(key).isJsonArray) {
                    return gson.fromJson(obj.get(key), type) ?: emptyList()
                }
            }

            // Fallback: look for any key whose value is a JsonArray
            for (entry in obj.entrySet()) {
                if (entry.value.isJsonArray) {
                    return gson.fromJson(entry.value, type) ?: emptyList()
                }
            }
        }

        return emptyList()
    }
}
