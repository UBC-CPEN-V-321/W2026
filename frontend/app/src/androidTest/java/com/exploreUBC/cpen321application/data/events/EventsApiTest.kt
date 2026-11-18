package com.exploreUBC.cpen321application.data.events

import com.exploreUBC.cpen321application.testutil.LocalHttpServer
import java.io.IOException
import kotlinx.coroutines.runBlocking
import org.json.JSONException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** EventsApi against a local HTTP server (no real backend). Covers oracle cases AND-API-1 to AND-API-4. */
class EventsApiTest {
    private val fullEvent = """
        {"id":"e1","title":"Concert","description":"Live music","imageUrl":"https://x/i.jpg",
         "startDateTime":"2026-12-05T03:00:00.000Z","endDateTime":"2026-12-05T05:00:00.000Z",
         "venueName":"Venue","city":"Vancouver","category":"Music","ticketUrl":"https://x/t",
         "priceMin":30,"priceMax":60.5,"currency":"CAD","distanceKm":2.5,"recommendationScore":90}
    """.trimIndent()

    private fun fetch(server: LocalHttpServer): List<Event> = runBlocking {
        EventsApi(server.baseUrl).getEvents("user-1", 49.2606, -123.246, 1, 20)
    }

    private fun eventsBody(vararg events: String) = """{"page":1,"limit":20,"count":${events.size},"events":[${events.joinToString(",")}]}"""

    @Test
    // AND-API-1: the request carries the encoded user ID, location, page and limit.
    fun requestContainsEncodedUserAndQueryParameters() {
        LocalHttpServer(200, eventsBody()).use { server ->
            runBlocking { EventsApi(server.baseUrl + "/").getEvents("user/1 x", 49.2606, -123.246, 2, 20) }

            assertEquals(
                "GET /api/v1/users/user%2F1+x/events?latitude=49.2606&longitude=-123.246&page=2&limit=20 HTTP/1.1",
                server.requestLines.single(),
            )
        }
    }

    @Test
    // AND-API-2: every field the UI uses is parsed; the backend's recommendationScore is not stored.
    fun parsesAllEventFields() {
        LocalHttpServer(200, eventsBody(fullEvent)).use { server ->
            val event = fetch(server).single()

            assertEquals(
                Event(
                    id = "e1", title = "Concert", description = "Live music", imageUrl = "https://x/i.jpg",
                    startDateTime = "2026-12-05T03:00:00.000Z", endDateTime = "2026-12-05T05:00:00.000Z",
                    venueName = "Venue", city = "Vancouver", category = "Music", ticketUrl = "https://x/t",
                    priceMin = 30.0, priceMax = 60.5, currency = "CAD", distanceKm = 2.5,
                ),
                event,
            )
        }
    }

    @Test
    // AND-API-2: optional fields become null when absent or JSON null.
    fun optionalFieldsBecomeNullWhenAbsentOrNull() {
        val absent = """{"id":"a","title":"T","imageUrl":"i","startDateTime":"s","venueName":"v","city":"c","category":"k","ticketUrl":"t","distanceKm":1}"""
        val jsonNull = """{"id":"b","title":"T","description":null,"imageUrl":"i","startDateTime":"s","endDateTime":null,"venueName":"v","city":"c","category":"k","ticketUrl":"t","priceMin":null,"priceMax":null,"currency":null,"distanceKm":1}"""
        LocalHttpServer(200, eventsBody(absent, jsonNull)).use { server ->
            val events = fetch(server)

            assertEquals(2, events.size)
            events.forEach {
                assertEquals(
                    listOf(null, null, null, null, null),
                    listOf(it.description, it.endDateTime, it.priceMin, it.priceMax, it.currency),
                )
            }
        }
    }

    @Test
    // AND-API-2: an empty event list parses to an empty list.
    fun emptyEventListParsesToEmptyList() {
        LocalHttpServer(200, eventsBody()).use { server -> assertTrue(fetch(server).isEmpty()) }
    }

    @Test
    // AND-API-3: a non-200 response throws IOException that names the HTTP status.
    fun nonOkStatusThrowsIoExceptionWithStatus() {
        listOf(400, 404, 500).forEach { status ->
            LocalHttpServer(status, """{"error":"x"}""").use { server ->
                try {
                    fetch(server)
                    fail("Expected IOException for HTTP $status")
                } catch (error: IOException) {
                    assertTrue(error.message.orEmpty().contains("HTTP $status"))
                }
            }
        }
    }

    @Test
    // AND-API-4: malformed JSON throws JSONException.
    fun malformedJsonThrowsJsonException() {
        LocalHttpServer(200, "not json").use { server ->
            try {
                fetch(server)
                fail("Expected JSONException")
            } catch (_: JSONException) {
            }
        }
    }

    @Test
    // AND-API-4: an event missing a required field throws JSONException and no partial event is returned.
    fun eventMissingRequiredFieldThrowsJsonException() {
        val noTitle = fullEvent.replace("\"title\":\"Concert\",", "")
        LocalHttpServer(200, eventsBody(noTitle)).use { server ->
            try {
                fetch(server)
                fail("Expected JSONException")
            } catch (_: JSONException) {
            }
        }
    }

    @Test
    // AND-API-4: a response without the events array throws JSONException.
    fun missingEventsArrayThrowsJsonException() {
        LocalHttpServer(200, """{"page":1}""").use { server ->
            try {
                fetch(server)
                fail("Expected JSONException")
            } catch (_: JSONException) {
            }
        }
    }
}
