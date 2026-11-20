package com.exploreUBC.cpen321application.e2e.itineraries

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onLast
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import com.exploreUBC.cpen321application.MainActivity2
import com.exploreUBC.cpen321application.data.itineraries.ActivityItem
import com.exploreUBC.cpen321application.data.itineraries.CreateActivityInput
import com.exploreUBC.cpen321application.data.itineraries.CreateItineraryInput
import com.exploreUBC.cpen321application.data.itineraries.CreateTransportationInput
import com.exploreUBC.cpen321application.data.itineraries.ItinerariesApi
import com.exploreUBC.cpen321application.data.itineraries.TransportationItem
import com.exploreUBC.cpen321application.testutil.REAL_BACKEND_TIMEOUT_MS
import com.exploreUBC.cpen321application.testutil.REAL_BACKEND_USER_ID
import com.exploreUBC.cpen321application.testutil.beforeActivityRule
import com.exploreUBC.cpen321application.testutil.realBackendClient
import com.exploreUBC.cpen321application.testutil.signedInTestUserRule
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain

/** Itinerary journeys through the real main activity and non-mocked backend. */
class ItineraryE2ETest {
    private val composeRule = createAndroidComposeRule<MainActivity2>()
    private lateinit var api: ItinerariesApi
    private lateinit var itineraryId: String
    private lateinit var activityId: String
    private lateinit var transportationId: String

    @get:Rule
    val rules: RuleChain = RuleChain
        .outerRule(signedInTestUserRule())
        .around(beforeActivityRule { resetBackendFixture() })
        .around(composeRule)

    @Before
    fun openTripsFromMainScreen() {
        waitForTag("navigation_Trips")
        composeRule.onNodeWithTag("navigation_Trips").performClick()
        waitForTag("saved_itinerary_$itineraryId")
    }

    @Test
    fun createItineraryFromTripsList() {
        composeRule.onNodeWithTag("create_itinerary").assertIsDisplayed().performClick()

        composeRule.onNodeWithText("Itinerary details").assertIsDisplayed()
        composeRule.onNodeWithText("Untitled Itinerary").assertIsDisplayed()
        composeRule.onNodeWithTag("itinerary_back").performClick()

        composeRule.onNodeWithText("Saved Itineraries").assertIsDisplayed()
        composeRule.onNodeWithText("Untitled Itinerary").assertIsDisplayed()
        assertTrue(loadItineraries().any { it.name == "Untitled Itinerary" })
    }

    @Test
    fun modifyItineraryAndValidateMaximumLength() {
        openItinerary()
        composeRule.onNodeWithTag("itinerary_details_edit").performClick()

        composeRule.onNodeWithTag("itinerary_name").performTextReplacement("a".repeat(101))
        composeRule.onNodeWithTag("itinerary_name_length_error").assertIsDisplayed()
        composeRule.onNodeWithText("Name must be at most 100 characters.").assertIsDisplayed()
        composeRule.onNodeWithTag("itinerary_save").assertIsNotEnabled()

        composeRule.onNodeWithTag("itinerary_name").performTextReplacement("new name")
        composeRule.onNodeWithTag("itinerary_description")
            .performTextReplacement("new description")
        composeRule.onNodeWithTag("itinerary_starting_location")
            .performTextReplacement("UBC nest")
        composeRule.onNodeWithTag("itinerary_save").performClick()

        composeRule.onNodeWithTag("itinerary_status")
            .assertTextContains("Itinerary details saved.")
        val stored = loadItinerary()
        assertTrue(
            stored.name == "new name" &&
                stored.description == "new description" &&
                stored.startingLocation == "UBC nest",
        )
    }

    @Test
    fun addActivityWithFrontendFailureScenarios() {
        openItinerary()
        composeRule.onNodeWithTag("itinerary_add_activity").performScrollTo().performClick()

        composeRule.onNodeWithText("New activity").assertIsDisplayed()
        composeRule.onNodeWithTag("new_item_create").assertIsNotEnabled()
        composeRule.onNodeWithTag("new_activity_name").performTextReplacement("a".repeat(201))
        composeRule.onNodeWithTag("new_activity_name_length_error").assertIsDisplayed()

        composeRule.onNodeWithTag("new_activity_name").performTextReplacement("new activity")
        composeRule.onNodeWithTag("new_activity_category").performClick()
        composeRule.onNodeWithText("Outdoors").performClick()
        composeRule.onNodeWithTag("new_activity_location").performTextReplacement("UBC nest")
        setDateTime("new_activity_start_time", hour = 2)
        setDateTime("new_activity_end_time", hour = 1)
        composeRule.onNodeWithTag("time_order_error").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithTag("new_item_create").assertIsNotEnabled()

        setDateTime("new_activity_end_time", hour = 3)
        composeRule.onNodeWithTag("new_item_create").assertIsEnabled().performClick()

        composeRule.onNodeWithTag("itinerary_status").assertTextContains("Activity added.")
        val added = loadItinerary().items.filterIsInstance<ActivityItem>()
            .single { it.name == "new activity" }
        waitForTag("itinerary_item_${added.id}")
        assertTrue(added.category == "outdoors")
    }

    @Test
    fun addTransportationWithFrontendFailureScenarios() {
        openItinerary()
        composeRule.onNodeWithTag("itinerary_add_transportation").performScrollTo().performClick()

        composeRule.onNodeWithText("New transportation").assertIsDisplayed()
        composeRule.onNodeWithTag("new_transportation_mode").performClick()
        composeRule.onNodeWithText("Walking").performClick()
        composeRule.onNodeWithTag("new_transportation_start_location")
            .performTextReplacement("UBC Nest")
        composeRule.onNodeWithTag("new_transportation_end_location")
            .performTextReplacement("UBC MCLD")
        composeRule.onNodeWithTag("new_transportation_distance").performTextReplacement("abc")
        composeRule.onNodeWithTag("distance_error").assertIsDisplayed()
        composeRule.onNodeWithTag("new_transportation_distance").performTextReplacement("400")

        composeRule.onNodeWithTag("new_transportation_start_location")
            .performTextReplacement("a".repeat(501))
        composeRule.onNodeWithTag("new_transportation_start_location_length_error")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("new_transportation_start_location")
            .performTextReplacement("UBC Nest")
        setDateTime("new_transportation_start_time", hour = 2)
        setDateTime("new_transportation_end_time", hour = 1)
        composeRule.onNodeWithTag("time_order_error").performScrollTo().assertIsDisplayed()
        setDateTime("new_transportation_end_time", hour = 3)

        composeRule.onNodeWithTag("new_item_create").assertIsEnabled().performClick()
        composeRule.onNodeWithTag("itinerary_status")
            .assertTextContains("Transportation added.")
        val added = loadItinerary().items.filterIsInstance<TransportationItem>()
            .single { it.startLocation == "UBC Nest" && it.endLocation == "UBC MCLD" }
        waitForTag("itinerary_item_${added.id}")
        assertTrue(added.distanceMeters == 400.0)
    }

    @Test
    fun modifyAndRemoveActivity() {
        openItinerary()
        composeRule.onNodeWithTag("itinerary_item_$activityId").performClick()
        composeRule.onNodeWithTag("itinerary_item_edit").performClick()
        composeRule.onNodeWithTag("edit_activity_name")
            .performTextReplacement("edited activity")
        composeRule.onNodeWithTag("edit_activity_category").performClick()
        composeRule.onNodeWithText("Art").performClick()
        composeRule.onNodeWithTag("edit_activity_location").performTextReplacement("UBC Nest")
        composeRule.onNodeWithTag("edit_activity_save").performScrollTo().performClick()

        composeRule.onNodeWithTag("itinerary_item_status").assertTextContains("Activity saved.")
        assertTrue(
            loadItinerary().items.filterIsInstance<ActivityItem>()
                .single { it.id == activityId }.name == "edited activity",
        )

        composeRule.onNodeWithTag("itinerary_item_delete").performScrollTo().performClick()
        composeRule.onNodeWithText("Delete item?").assertIsDisplayed()
        composeRule.onNodeWithTag("confirm_item_delete").performClick()

        composeRule.onNodeWithTag("itinerary_status").assertTextContains("Item deleted.")
        assertFalse(loadItinerary().items.any { it.id == activityId })
    }

    @Test
    fun modifyAndRemoveTransportation() {
        openItinerary()
        composeRule.onNodeWithTag("itinerary_item_$transportationId").performClick()
        composeRule.onNodeWithTag("itinerary_item_edit").performClick()

        composeRule.onNodeWithTag("edit_transportation_distance").performTextReplacement("abc")
        composeRule.onNodeWithTag("distance_error").assertIsDisplayed()
        composeRule.onNodeWithTag("edit_transportation_save").assertIsNotEnabled()
        composeRule.onNodeWithTag("edit_transportation_distance").performTextReplacement("400")
        composeRule.onNodeWithTag("edit_transportation_start_location")
            .performTextReplacement("UBC Nest")
        composeRule.onNodeWithTag("edit_transportation_end_location")
            .performTextReplacement("UBC Exchange")
        composeRule.onNodeWithTag("edit_transportation_mode").performClick()
        composeRule.onNodeWithText("Transit").performClick()
        composeRule.onNodeWithTag("edit_transportation_save").performScrollTo().performClick()

        composeRule.onNodeWithTag("itinerary_item_status")
            .assertTextContains("Transportation saved.")
        val stored = loadItinerary().items.filterIsInstance<TransportationItem>()
            .single { it.id == transportationId }
        assertTrue(stored.mode == "transit" && stored.distanceMeters == 400.0)

        composeRule.onNodeWithTag("itinerary_item_delete").performScrollTo().performClick()
        composeRule.onNodeWithTag("confirm_item_delete").performClick()
        composeRule.onNodeWithTag("itinerary_status").assertTextContains("Item deleted.")
        assertFalse(loadItinerary().items.any { it.id == transportationId })
    }

    @Test
    fun deleteItineraryRequiresConfirmation() {
        openItinerary()
        composeRule.onNodeWithTag("itinerary_delete").performScrollTo().performClick()
        composeRule.onNodeWithText("Delete itinerary?").assertIsDisplayed()
        composeRule.onNodeWithTag("cancel_delete_itinerary").performClick()
        assertTrue(loadItineraries().any { it.id == itineraryId })

        composeRule.onNodeWithTag("itinerary_delete").performClick()
        composeRule.onNodeWithTag("confirm_delete_itinerary").performClick()

        composeRule.onNodeWithTag("trips_status").assertTextContains("Itinerary deleted.")
        assertFalse(loadItineraries().any { it.id == itineraryId })
    }

    private fun resetBackendFixture() {
        api = ItinerariesApi(realBackendClient())
        runBlocking {
            api.getItineraries(REAL_BACKEND_USER_ID).forEach {
                api.deleteItinerary(REAL_BACKEND_USER_ID, it.id)
            }
            val itinerary = api.createItinerary(
                REAL_BACKEND_USER_ID,
                CreateItineraryInput(
                    name = FIXTURE_NAME,
                    description = "Created by the itinerary E2E suite.",
                    startingLocation = "UBC Bus Exchange",
                ),
            )
            itineraryId = itinerary.id
            activityId = api.addActivity(
                REAL_BACKEND_USER_ID,
                itinerary.id,
                CreateActivityInput(
                    name = "Fixture activity",
                    category = "food",
                    location = "UBC Nest",
                    startTime = "2027-11-30T17:00:00.000Z",
                    endTime = "2027-11-30T18:00:00.000Z",
                ),
            ).id
            transportationId = api.addTransportationSegment(
                REAL_BACKEND_USER_ID,
                itinerary.id,
                CreateTransportationInput(
                    mode = "walking",
                    startLocation = "UBC Nest",
                    endLocation = "UBC Bookstore",
                    distanceMeters = 500.0,
                    startTime = "2027-11-30T18:00:00.000Z",
                    endTime = "2027-11-30T18:30:00.000Z",
                ),
            ).id
        }
    }

    private fun openItinerary() {
        composeRule.onNodeWithTag("saved_itinerary_$itineraryId").performClick()
        waitForTag("itinerary_details_edit")
    }

    private fun loadItinerary() = runBlocking {
        api.getItinerary(REAL_BACKEND_USER_ID, itineraryId)
    }

    private fun loadItineraries() = runBlocking {
        api.getItineraries(REAL_BACKEND_USER_ID)
    }

    private fun setDateTime(tag: String, hour: Int, period: String = "PM") {
        composeRule.onNodeWithTag(tag).performScrollTo().performClick()
        composeRule.onNodeWithText("Next").performClick()
        composeRule.onNodeWithContentDescription("$hour o'clock").performClick()
        composeRule.onAllNodesWithContentDescription("0 minutes").onLast().performClick()
        composeRule.onNodeWithText(period).performClick()
        composeRule.onNodeWithText("OK").performClick()
    }

    private fun waitForTag(tag: String) {
        composeRule.waitUntil(REAL_BACKEND_TIMEOUT_MS) {
            composeRule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()
        }
    }

    private companion object {
        const val FIXTURE_NAME = "E2E Itinerary Fixture"
    }
}
