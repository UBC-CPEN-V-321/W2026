package com.exploreUBC.cpen321application.ui.events

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.UriHandler
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasProgressBarRangeInfo
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.exploreUBC.cpen321application.data.events.Event
import com.exploreUBC.cpen321application.data.itineraries.ItinerariesRepository
import com.exploreUBC.cpen321application.data.location.UserLocation
import com.exploreUBC.cpen321application.testutil.E2E_USER_ID
import com.exploreUBC.cpen321application.testutil.FakeEventsRepository
import com.exploreUBC.cpen321application.testutil.InMemoryItinerariesRepository
import com.exploreUBC.cpen321application.testutil.scrollToText
import com.exploreUBC.cpen321application.testutil.testEvent
import com.exploreUBC.cpen321application.testutil.testEvents
import com.exploreUBC.cpen321application.testutil.waitForText
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import org.json.JSONException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** Live Events screen with fake repositories (no backend). Covers oracle cases UI-1 to UI-9 and INT-9. */
class LiveEventsScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val events = FakeEventsRepository()
    private var firstPages = mutableListOf<List<Event>>()

    private fun show(
        userId: String? = E2E_USER_ID,
        itineraries: ItinerariesRepository = InMemoryItinerariesRepository(),
        location: UserLocation = UserLocation.UBC,
        uriHandler: UriHandler? = null,
    ) {
        composeRule.setContent {
            val screen = @androidx.compose.runtime.Composable {
                LiveEventsScreen(
                    userId = userId,
                    eventsRepository = events,
                    itinerariesRepository = itineraries,
                    location = location,
                    onFirstPageLoaded = { firstPages.add(it) },
                )
            }
            if (uriHandler == null) {
                screen()
            } else {
                CompositionLocalProvider(LocalUriHandler provides uriHandler) { screen() }
            }
        }
    }

    @Test
    // UI-1: a null user shows "User is unavailable" and never calls the repository.
    fun nullUserShowsUnavailableWithoutRequest() {
        show(userId = null)

        composeRule.waitForText("User is unavailable")
        assertTrue(events.calls.isEmpty())
    }

    @Test
    // UI-1: a blank user is treated like a missing user.
    fun blankUserShowsUnavailableWithoutRequest() {
        show(userId = "  ")

        composeRule.waitForText("User is unavailable")
        assertTrue(events.calls.isEmpty())
    }

    @Test
    // UI-2: loading is shown while the first request runs, then the events replace it.
    fun showsLoadingUntilFirstPageArrives() {
        val gate = CompletableDeferred<List<Event>>()
        events.handler = { gate.await() }
        show()

        composeRule.onNode(hasProgressBarRangeInfo(ProgressBarRangeInfo.Indeterminate)).assertIsDisplayed()
        gate.complete(listOf(testEvent("a", title = "Loaded Event")))

        composeRule.waitForText("Loaded Event")
    }

    @Test
    // UI-3 and AND-API request: first page is page 1 of size 20 for the user and location, and is reported.
    fun showsFirstPageAndReportsIt() {
        val page = testEvents(3)
        events.handler = { page }
        show(location = UserLocation(49.3, -123.1))

        composeRule.waitForText("Event event-1")
        composeRule.onNodeWithText("Event event-3").assertIsDisplayed()
        val call = events.calls.first()
        assertEquals(listOf(E2E_USER_ID, 49.3, -123.1, 1, 20),
            listOf(call.userId, call.latitude, call.longitude, call.page, call.limit))
        assertEquals(listOf(page), firstPages)
    }

    @Test
    // UI-4: a card shows its title, category, description, start time, venue, price and distance.
    fun cardShowsAllEventDetails() {
        val event = testEvent("full", title = "Full Event")
        events.handler = { listOf(event) }
        show()

        composeRule.waitForText("Full Event")
        composeRule.onNodeWithText("Music").assertIsDisplayed()
        composeRule.onNodeWithText("Description of full").assertIsDisplayed()
        composeRule.onNodeWithText(formatDate(event.startDateTime)).assertIsDisplayed()
        composeRule.onNodeWithText("Venue full, Vancouver").assertIsDisplayed()
        composeRule.onNodeWithText("CAD 30.00 - 60.00").assertIsDisplayed()
        composeRule.onNodeWithText("2.5 km away").assertIsDisplayed()
        composeRule.onNodeWithText("View event details").assertIsDisplayed()
        composeRule.onNodeWithText("Add to itinerary").assertIsDisplayed()
    }

    @Test
    // UI-4: missing description and price fall back to the default texts.
    fun cardShowsFallbacksForMissingDescriptionAndPrice() {
        events.handler = {
            listOf(testEvent("bare", description = null, priceMin = null, priceMax = null, currency = null))
        }
        show()

        composeRule.waitForText("No description available.")
        composeRule.onNodeWithText("Price unavailable").assertIsDisplayed()
    }

    @Test
    // UI-5: Load more asks for the next page, appends it, and does not duplicate repeated events.
    fun loadMoreAppendsNextPageWithoutDuplicates() {
        events.handler = { call ->
            if (call.page == 1) {
                testEvents(20)
            } else {
                listOf(testEvent("event-20"), testEvent("event-21", title = "Last Event"))
            }
        }
        show()
        composeRule.waitForText("Event event-1")

        composeRule.scrollToText("Load more")
        composeRule.onNodeWithText("Load more").performClick()
        composeRule.scrollToText("Last Event")

        assertEquals(listOf(1, 2), events.calls.map { it.page })
        composeRule.onAllNodesWithText("Event event-20").assertCountEquals(1)
        composeRule.onAllNodesWithText("Load more").assertCountEquals(0)
    }

    @Test
    // UI-5: Load more is offered only when the latest page holds exactly 20 events.
    fun noLoadMoreWhenFirstPageIsNotFull() {
        events.handler = { testEvents(19) }
        show()

        composeRule.waitForText("Event event-1")
        composeRule.onAllNodesWithText("Load more").assertCountEquals(0)
    }

    @Test
    // UI-6: a failed later page keeps existing events, shows the error, and can be retried.
    fun failedLoadMoreKeepsEventsAndRetries() {
        var failNext = true
        events.handler = { call ->
            when {
                call.page == 1 -> testEvents(20)
                failNext -> { failNext = false; throw IOException("page two failed") }
                else -> listOf(testEvent("event-21", title = "Recovered Event"))
            }
        }
        show()
        composeRule.waitForText("Event event-1")

        composeRule.scrollToText("Load more")
        composeRule.onNodeWithText("Load more").performClick()
        composeRule.waitForText("page two failed")
        composeRule.scrollToText("Retry loading")
        composeRule.onNodeWithText("Retry loading").performClick()

        composeRule.scrollToText("Recovered Event")
        // The earlier events are kept: scrolling back up shows the first card again.
        composeRule.scrollToText("Event event-1")
        assertEquals(listOf(1, 2, 2), events.calls.map { it.page })
    }

    @Test
    // UI-7: an IOException on the first request shows the error and Retry repeats the request.
    fun firstRequestIoFailureShowsRetry() {
        var failNext = true
        events.handler = {
            if (failNext) { failNext = false; throw IOException("server down") }
            listOf(testEvent("a", title = "After Retry"))
        }
        show()

        composeRule.waitForText("server down")
        composeRule.onNodeWithText("Retry").performClick()

        composeRule.waitForText("After Retry")
        assertEquals(listOf(1, 1), events.calls.map { it.page })
    }

    @Test
    // UI-7: a JSONException on the first request is handled the same way.
    fun firstRequestJsonFailureShowsRetry() {
        events.handler = { throw JSONException("bad json") }
        show()

        composeRule.waitForText("bad json")
        composeRule.onNodeWithText("Retry").assertIsDisplayed()
    }

    @Test
    // UI-8: the Refresh button clears the list and requests page 1 again.
    fun refreshRequestsPageOneAgain() {
        var round = 0
        events.handler = { listOf(testEvent("a", title = "Round ${++round}")) }
        show()
        composeRule.waitForText("Round 1")

        composeRule.onNodeWithText("Refresh").performClick()

        composeRule.waitForText("Round 2")
        assertEquals(listOf(1, 1), events.calls.map { it.page })
    }

    @Test
    // UI-9: "View event details" opens the event's ticket URL.
    fun viewEventDetailsOpensTicketUrl() {
        val opened = mutableListOf<String>()
        events.handler = { listOf(testEvent("a", ticketUrl = "https://tickets.example/a")) }
        show(uriHandler = object : UriHandler {
            override fun openUri(uri: String) { opened.add(uri) }
        })
        composeRule.waitForText("Event a")

        composeRule.onNodeWithText("View event details").performClick()

        assertEquals(listOf("https://tickets.example/a"), opened)
    }

    @Test
    // INT-9: if saved itineraries cannot be loaded, the dialog shows the error and offers no itinerary.
    fun itineraryLoadFailureIsShownInDialog() {
        events.handler = { listOf(testEvent("a")) }
        val failing = object : ItinerariesRepository by InMemoryItinerariesRepository() {
            override suspend fun getItineraries(
                userId: String,
                saved: Boolean?,
                inRecommendation: Boolean?,
            ) = throw IOException("itineraries unavailable")
        }
        show(itineraries = failing)
        composeRule.waitForText("Event a")

        composeRule.onNodeWithText("Add to itinerary").performClick()

        composeRule.waitForText("itineraries unavailable")
        composeRule.onAllNodesWithText("Added to", substring = true).assertCountEquals(0)
    }

    @Test
    // INT-4 failure: when adding fails (not a conflict), the error is shown and success is not reported.
    fun failedAddShowsErrorAndNoSuccess() {
        events.handler = { listOf(testEvent("a")) }
        val itineraries = InMemoryItinerariesRepository()
        val failing = object : ItinerariesRepository by itineraries {
            override suspend fun addActivity(
                userId: String,
                itineraryId: String,
                activity: com.exploreUBC.cpen321application.data.itineraries.CreateActivityInput,
            ) = throw IOException("could not add")

            override suspend fun addActivity(
                userId: String,
                itineraryId: String,
                activity: com.exploreUBC.cpen321application.data.itineraries.CreateActivityInput,
                replaceConflicts: Boolean,
            ) = throw IOException("could not add")
        }
        show(itineraries = failing)
        composeRule.waitForText("Event a")
        composeRule.onNodeWithText("Add to itinerary").performClick()
        composeRule.waitForText(itineraries.itineraries.first().name)

        composeRule.onNodeWithText(itineraries.itineraries.first().name).performClick()

        composeRule.waitForText("could not add")
        composeRule.onAllNodesWithText("Added to", substring = true).assertCountEquals(0)
    }
}
