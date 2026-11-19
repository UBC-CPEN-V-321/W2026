package com.exploreUBC.cpen321application.data.events

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.exploreUBC.cpen321application.data.network.ApiException
import com.exploreUBC.cpen321application.data.network.ApiRequest
import com.exploreUBC.cpen321application.data.network.BackendClient
import kotlinx.coroutines.runBlocking
import org.json.JSONException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class EventsApiTest {
    @Test
    fun getEventsUsesProtectedSharedClientRequest() = runBlocking {
        lateinit var request: ApiRequest
        val api = EventsApi(
            BackendClient {
                request = it
                """
                    {
                      "events": [{
                        "id": "event-id",
                        "title": "Campus Event",
                        "description": null,
                        "imageUrl": "https://example.test/image.jpg",
                        "startDateTime": "2026-10-24T20:00:00.000Z",
                        "venueName": "The Nest",
                        "city": "Vancouver",
                        "category": "music",
                        "ticketUrl": "https://example.test/tickets",
                        "priceMin": null,
                        "priceMax": null,
                        "currency": null,
                        "distanceKm": 1.25
                      }]
                    }
                """.trimIndent()
            },
        )

        val events = api.getEvents(
            userId = "user-id",
            latitude = 49.2606,
            longitude = -123.246,
            page = 2,
            limit = 10,
        )

        assertEquals("GET", request.method)
        assertTrue(request.requiresAuthentication)
        assertEquals(
            "/users/user-id/events" +
                "?latitude=49.2606&longitude=-123.246&page=2&limit=10",
            request.path,
        )
        assertEquals("Campus Event", events.single().title)
    }

    private val fullEvent = """
        {"id":"e1","title":"Concert","description":"Live music","imageUrl":"https://x/i.jpg",
         "startDateTime":"2026-12-05T03:00:00.000Z","endDateTime":"2026-12-05T05:00:00.000Z",
         "venueName":"Venue","city":"Vancouver","category":"Music","ticketUrl":"https://x/t",
         "priceMin":30,"priceMax":60.5,"currency":"CAD","distanceKm":2.5,"recommendationScore":90}
    """.trimIndent()

    private fun eventsBody(vararg events: String) =
        """{"page":1,"limit":20,"count":${events.size},"events":[${events.joinToString(",")}]}"""

    /** Fetches page 1 from an [EventsApi] whose backend client answers every request with [body]. */
    private fun fetch(body: String): List<Event> = runBlocking {
        EventsApi(BackendClient { body }).getEvents("user-1", 49.2606, -123.246, 1, 20)
    }

    @Test
    // AND-API-1: the user ID in the path is URL-encoded and the query carries location, page and limit.
    fun requestEncodesUserIdAndQueryParameters() = runBlocking {
        lateinit var request: ApiRequest
        EventsApi(BackendClient { request = it; eventsBody() })
            .getEvents("user/1 x", 49.2606, -123.246, 2, 20)

        assertEquals(
            "/users/user%2F1+x/events?latitude=49.2606&longitude=-123.246&page=2&limit=20",
            request.path,
        )
    }

    @Test
    // AND-API-2: every field the UI uses is parsed; the backend's recommendationScore is not stored.
    fun parsesAllEventFields() {
        assertEquals(
            Event(
                id = "e1", title = "Concert", description = "Live music", imageUrl = "https://x/i.jpg",
                startDateTime = "2026-12-05T03:00:00.000Z", endDateTime = "2026-12-05T05:00:00.000Z",
                venueName = "Venue", city = "Vancouver", category = "Music", ticketUrl = "https://x/t",
                priceMin = 30.0, priceMax = 60.5, currency = "CAD", distanceKm = 2.5,
            ),
            fetch(eventsBody(fullEvent)).single(),
        )
    }

    @Test
    // AND-API-2: optional fields become null when absent or JSON null.
    fun optionalFieldsBecomeNullWhenAbsentOrNull() {
        val absent = """{"id":"a","title":"T","imageUrl":"i","startDateTime":"s","venueName":"v","city":"c","category":"k","ticketUrl":"t","distanceKm":1}"""
        val jsonNull = """{"id":"b","title":"T","description":null,"imageUrl":"i","startDateTime":"s","endDateTime":null,"venueName":"v","city":"c","category":"k","ticketUrl":"t","priceMin":null,"priceMax":null,"currency":null,"distanceKm":1}"""

        val events = fetch(eventsBody(absent, jsonNull))

        assertEquals(2, events.size)
        events.forEach {
            assertEquals(
                listOf(null, null, null, null, null),
                listOf(it.description, it.endDateTime, it.priceMin, it.priceMax, it.currency),
            )
        }
    }

    @Test
    // AND-API-2: an empty event list parses to an empty list.
    fun emptyEventListParsesToEmptyList() {
        assertTrue(fetch(eventsBody()).isEmpty())
    }

    @Test
    // AND-API-3: an error from the shared client (HTTP failure or expired session) reaches the caller unchanged.
    fun backendClientFailureIsPassedToTheCaller() {
        listOf(400, 404, 500).forEach { status ->
            try {
                runBlocking {
                    EventsApi(BackendClient { throw ApiException.fromHttpStatus(status, null) })
                        .getEvents("user-1", 49.2606, -123.246, 1, 20)
                }
                fail("Expected ApiException for HTTP $status")
            } catch (error: ApiException) {
                assertEquals(status, error.statusCode)
            }
        }
    }

    @Test
    // AND-API-4: malformed JSON throws JSONException.
    fun malformedJsonThrowsJsonException() {
        try {
            fetch("not json")
            fail("Expected JSONException")
        } catch (_: JSONException) {
        }
    }

    @Test
    // AND-API-4: an event missing a required field throws JSONException and no partial event is returned.
    fun eventMissingRequiredFieldThrowsJsonException() {
        try {
            fetch(eventsBody(fullEvent.replace("\"title\":\"Concert\",", "")))
            fail("Expected JSONException")
        } catch (_: JSONException) {
        }
    }

    @Test
    // AND-API-4: a response without the events array throws JSONException.
    fun missingEventsArrayThrowsJsonException() {
        try {
            fetch("""{"page":1}""")
            fail("Expected JSONException")
        } catch (_: JSONException) {
        }
    }
}
