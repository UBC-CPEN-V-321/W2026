package com.exploreUBC.cpen321application.ui.events

import androidx.compose.foundation.layout.Box
import androidx.compose.material3.SnackbarHost
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.exploreUBC.cpen321application.data.location.UserLocation
import com.exploreUBC.cpen321application.testutil.FakeEventsRepository
import com.exploreUBC.cpen321application.testutil.REAL_BACKEND_TIMEOUT_MS
import com.exploreUBC.cpen321application.testutil.testEvent
import com.exploreUBC.cpen321application.testutil.waitForText
import java.io.IOException
import org.json.JSONException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** Recommendation snapshot, new-event notification and background refresh (REFRESH-1 to REFRESH-6). */
class EventRecommendationRefreshTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val state = AppEventRecommendationsState()
    private val repository = FakeEventsRepository()
    private val eventsVisible = mutableStateOf(false)
    private val location = mutableStateOf(UserLocation.UBC)
    private var viewActionCount = 0
    private val baseline = listOf(testEvent("a"))

    private fun idsOf(vararg ids: String) = ids.map { testEvent(it) }

    private fun show(userId: String? = "user-1") {
        composeRule.setContent {
            Box {
                SnackbarHost(state.snackbarHostState)
                AppEventRecommendationEffects(
                    userId = userId,
                    location = location.value,
                    isEventsVisible = eventsVisible.value,
                    repository = repository,
                    state = state,
                    onViewEvents = { viewActionCount++ },
                )
            }
        }
    }

    private fun waitForCalls(count: Int) =
        composeRule.waitUntil(REAL_BACKEND_TIMEOUT_MS) { repository.calls.size >= count }

    // ---- State: REFRESH-1 to REFRESH-3 -------------------------------------------------------

    @Test
    // REFRESH-1: cached events are returned only for the exact location of the snapshot.
    fun cachedEventsAreReturnedOnlyForTheSameLocation() {
        state.recordRecommendations(UserLocation.UBC, baseline, false)

        assertEquals(baseline, state.eventsAt(UserLocation.UBC))
        assertTrue(state.eventsAt(UserLocation(49.3, -123.1)).isEmpty())
    }

    @Test
    // REFRESH-2: the first recorded list is the baseline and does not notify.
    fun firstRecordingDoesNotNotify() {
        state.recordRecommendations(UserLocation.UBC, baseline, true)

        assertNull(state.currentNotification())
    }

    @Test
    // REFRESH-3: one new ID gives the singular message.
    fun oneNewEventGivesSingularMessage() {
        state.recordRecommendations(UserLocation.UBC, baseline, false)
        state.recordRecommendations(UserLocation.UBC, idsOf("a", "b"), true)

        assertEquals("1 new event near you", state.currentNotification())
    }

    @Test
    // REFRESH-3: several new IDs give the plural message with the count.
    fun severalNewEventsGivePluralMessage() {
        state.recordRecommendations(UserLocation.UBC, baseline, false)
        state.recordRecommendations(UserLocation.UBC, idsOf("a", "b", "c"), true)

        assertEquals("2 new events near you", state.currentNotification())
    }

    @Test
    // REFRESH-3: no new IDs, or only removed events, give no notification.
    fun noNewEventsGiveNoNotification() {
        state.recordRecommendations(UserLocation.UBC, idsOf("a", "b"), false)
        state.recordRecommendations(UserLocation.UBC, idsOf("a"), true)

        assertNull(state.currentNotification())
    }

    // ---- Effects: REFRESH-4 to REFRESH-6 -----------------------------------------------------

    @Test
    // REFRESH-6: while Events is hidden, page 1 is requested for the user and location, and new events notify.
    fun backgroundFetchNotifiesAboutNewEventsWhileEventsHidden() {
        state.recordRecommendations(UserLocation.UBC, baseline, false)
        repository.handler = { idsOf("a", "b") }
        show()

        composeRule.waitForText("1 new event near you")
        val call = repository.calls.first()
        assertEquals(
            listOf("user-1", UserLocation.UBC.latitude, UserLocation.UBC.longitude, 1, 20),
            listOf(call.userId, call.latitude, call.longitude, call.page, call.limit),
        )
    }

    @Test
    // REFRESH-6: nothing is fetched while the Events screen is visible.
    fun noBackgroundFetchWhileEventsVisible() {
        eventsVisible.value = true
        show()

        composeRule.waitForIdle()
        assertTrue(repository.calls.isEmpty())
    }

    @Test
    // REFRESH-6: a missing user prevents the background request.
    fun noBackgroundFetchWithoutUser() {
        show(userId = null)

        composeRule.waitForIdle()
        assertTrue(repository.calls.isEmpty())
    }

    @Test
    // REFRESH-6: IOException and JSONException from the background request are ignored.
    fun backgroundErrorsAreIgnored() {
        state.recordRecommendations(UserLocation.UBC, baseline, false)
        repository.handler = { throw IOException("offline") }
        show()
        waitForCalls(1)

        repository.handler = { throw JSONException("bad") }
        composeRule.runOnIdle { state.refreshAfterPreferenceChange() }
        waitForCalls(2)

        composeRule.waitForIdle()
        assertNull(state.currentNotification())
    }

    @Test
    // REFRESH-4: a preference change requests page 1 again for the same user and location.
    fun preferenceChangeRefetchesWithSameUserAndLocation() {
        state.recordRecommendations(UserLocation.UBC, baseline, false)
        repository.handler = { baseline }
        show()
        waitForCalls(1)

        repository.handler = { idsOf("a", "z") }
        composeRule.runOnIdle { state.refreshAfterPreferenceChange() }

        composeRule.waitForText("1 new event near you")
        assertEquals(2, repository.calls.size)
        assertEquals(repository.calls[0], repository.calls[1])
    }

    @Test
    // REFRESH-5: a new location requests page 1 for the new coordinates.
    fun locationChangeRefetchesForNewCoordinates() {
        state.recordRecommendations(UserLocation.UBC, baseline, false)
        repository.handler = { baseline }
        show()
        waitForCalls(1)

        composeRule.runOnIdle { location.value = UserLocation(49.1, -122.9) }
        waitForCalls(2)

        val last = repository.calls.last()
        assertEquals(listOf(49.1, -122.9, 1), listOf(last.latitude, last.longitude, last.page))
    }

    @Test
    // REFRESH-6: the snackbar's View action navigates to Events.
    fun viewActionOpensEvents() {
        state.recordRecommendations(UserLocation.UBC, baseline, false)
        repository.handler = { idsOf("a", "b") }
        show()
        composeRule.waitForText("1 new event near you")

        composeRule.onNodeWithText("View").performClick()

        composeRule.waitUntil(REAL_BACKEND_TIMEOUT_MS) { viewActionCount == 1 }
        assertNull(state.currentNotification())
    }

    @Test
    // REFRESH-6: opening Events dismisses the notification.
    fun openingEventsDismissesNotification() {
        state.recordRecommendations(UserLocation.UBC, baseline, false)
        repository.handler = { idsOf("a", "b") }
        show()
        composeRule.waitForText("1 new event near you")

        composeRule.runOnIdle { eventsVisible.value = true }

        composeRule.waitUntil(REAL_BACKEND_TIMEOUT_MS) { state.currentNotification() == null }
        composeRule.onAllNodesWithText("1 new event near you").assertCountEquals(0)
    }
}
