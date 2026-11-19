package com.exploreUBC.cpen321application.e2e.events

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import com.exploreUBC.cpen321application.MainActivity2
import com.exploreUBC.cpen321application.testutil.BASELINE_ITINERARY_NAME
import com.exploreUBC.cpen321application.testutil.OVERLAPPING_ACTIVITY_NAME
import com.exploreUBC.cpen321application.testutil.activities
import com.exploreUBC.cpen321application.testutil.beforeActivityRule
import com.exploreUBC.cpen321application.testutil.grantLocationPermissionRule
import com.exploreUBC.cpen321application.testutil.signedInTestUserRule
import com.exploreUBC.cpen321application.testutil.loadItineraries
import com.exploreUBC.cpen321application.testutil.resetItineraries
import com.exploreUBC.cpen321application.testutil.resetUserInterest
import com.exploreUBC.cpen321application.testutil.waitForText
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain

/**
 * Adding a Live Event to an itinerary, against the real backend. Run after `npm run e2e:seed`, with
 * the backend on the E2E database and the emulator location set to UBC (see Testing.md, Section 4).
 * "E2E Event 01" overlaps the seeded itinerary activity; "E2E Event 02" does not.
 */
class EventItineraryE2ETest {
    private val permissions = grantLocationPermissionRule()
    private val composeRule = createAndroidComposeRule<MainActivity2>()

    @get:Rule
    val rules: RuleChain = RuleChain
        .outerRule(permissions)
        .around(signedInTestUserRule())
        .around(
            beforeActivityRule {
                resetUserInterest()
                resetItineraries(withOverlap = true)
            },
        )
        .around(composeRule)

    private fun openAddToItineraryDialogOfEventCard(position: Int, eventTitle: String) {
        composeRule.waitForText(eventTitle)
        composeRule.onAllNodesWithText("Add to itinerary")[position].performScrollTo().performClick()
        composeRule.waitForText("Add $eventTitle")
    }

    @Test
    // Section 4.2 — Add an Event to an Itinerary: steps 1–4.
    fun addsNonOverlappingEventToExistingItinerary() {
        openAddToItineraryDialogOfEventCard(position = 1, eventTitle = "E2E Event 02")

        composeRule.onNodeWithText("Starts:", substring = true).assertIsDisplayed()
        composeRule.onNodeWithTag("event_end_time").assertIsDisplayed()
        composeRule.waitForText(BASELINE_ITINERARY_NAME)
        composeRule.onNodeWithText(BASELINE_ITINERARY_NAME).performClick()

        composeRule.waitForText("Added to $BASELINE_ITINERARY_NAME.")
        val added = loadItineraries().single().activities().single { it.name == "E2E Event 02" }
        assertEquals("E2E Venue, Vancouver", added.location)
        assertEquals(
            Instant.parse(added.startTime).plusSeconds(2 * 60 * 60),
            Instant.parse(added.endTime),
        )
    }

    @Test
    // Section 4.2 — Add an Event to an Itinerary: failure 2a–2a1.
    fun createsItineraryWhenUserHasNone() {
        resetItineraries(withOverlap = false)
        openAddToItineraryDialogOfEventCard(position = 0, eventTitle = "E2E Event 01")

        composeRule.waitForText("You do not have an itinerary yet.")
        composeRule.onNodeWithText("Create and add").assertIsNotEnabled()
        composeRule.onNode(hasSetTextAction()).performTextInput("E2E New Itinerary")
        composeRule.onNodeWithText("Create and add").assertIsEnabled().performClick()

        composeRule.waitForText("Created E2E New Itinerary and added the event.")
        val created = loadItineraries().single()
        assertEquals("E2E New Itinerary", created.name)
        assertEquals(listOf("E2E Event 01"), created.activities().map { it.name })
    }

    @Test
    // Section 4.2 — Add an Event to an Itinerary: failure 3a–3a1.
    fun rejectsEndTimeNotAfterEventStart() {
        openAddToItineraryDialogOfEventCard(position = 0, eventTitle = "E2E Event 01")
        composeRule.waitForText(BASELINE_ITINERARY_NAME)

        // The default end time is 8 or 9 PM; switching it to AM moves it before the evening start.
        composeRule.onNodeWithTag("event_end_time").performClick()
        composeRule.onNodeWithText("Next").performClick()
        composeRule.onNodeWithText("AM").performClick()
        composeRule.onNodeWithText("OK").performClick()

        composeRule.onNodeWithText("End time must be after the event start time.").assertIsDisplayed()
        composeRule.onNodeWithText(BASELINE_ITINERARY_NAME).assertIsNotEnabled()
        assertTrue(loadItineraries().single().activities().none { it.name == "E2E Event 01" })
    }

    @Test
    // Section 4.2 — Add an Event to an Itinerary: steps 3b–3b2 (keep existing schedule).
    fun keepsExistingScheduleOnTimeConflict() {
        openAddToItineraryDialogOfEventCard(position = 0, eventTitle = "E2E Event 01")
        composeRule.waitForText(BASELINE_ITINERARY_NAME)
        composeRule.onNodeWithText(BASELINE_ITINERARY_NAME).performClick()

        composeRule.waitForText("Schedule conflict")
        composeRule.onNodeWithText(OVERLAPPING_ACTIVITY_NAME, substring = true).assertIsDisplayed()
        composeRule.onAllNodesWithText("Added to $BASELINE_ITINERARY_NAME.").assertCountEquals(0)
        composeRule.onNodeWithText("Keep existing schedule").performClick()

        composeRule.onAllNodesWithText("Schedule conflict").assertCountEquals(0)
        assertEquals(
            listOf(OVERLAPPING_ACTIVITY_NAME),
            loadItineraries().single().activities().map { it.name },
        )
    }

    @Test
    // Section 4.2 — Add an Event to an Itinerary: steps 3b–3b3 (replace conflicting items).
    fun replacesConflictingItemOnTimeConflict() {
        openAddToItineraryDialogOfEventCard(position = 0, eventTitle = "E2E Event 01")
        composeRule.waitForText(BASELINE_ITINERARY_NAME)
        composeRule.onNodeWithText(BASELINE_ITINERARY_NAME).performClick()

        composeRule.waitForText("Schedule conflict")
        composeRule.onNodeWithText("Replace with new item").performClick()

        composeRule.waitForText("Added to $BASELINE_ITINERARY_NAME.")
        assertEquals(
            listOf("E2E Event 01"),
            loadItineraries().single().activities().map { it.name },
        )
    }
}
