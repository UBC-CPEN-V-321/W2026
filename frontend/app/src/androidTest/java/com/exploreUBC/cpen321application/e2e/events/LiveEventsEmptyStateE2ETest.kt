package com.exploreUBC.cpen321application.e2e.events

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.exploreUBC.cpen321application.MainActivity2
import com.exploreUBC.cpen321application.data.events.EventsApi
import com.exploreUBC.cpen321application.testutil.MockLocationRule
import com.exploreUBC.cpen321application.testutil.REAL_BACKEND_USER_ID
import com.exploreUBC.cpen321application.testutil.beforeActivityRule
import com.exploreUBC.cpen321application.testutil.grantLocationPermissionRule
import com.exploreUBC.cpen321application.testutil.realBackendClient
import com.exploreUBC.cpen321application.testutil.signedInTestUserRule
import com.exploreUBC.cpen321application.testutil.resetUserInterest
import com.exploreUBC.cpen321application.testutil.waitForText
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain

/**
 * Empty state of Live Events against the shared E2E seed. The test moves the app to a location
 * with no seeded events, so it exercises the empty state without changing the database contents.
 */
class LiveEventsEmptyStateE2ETest {
    private val permissions = grantLocationPermissionRule()
    private val mockLocation = MockLocationRule(NO_EVENTS_LATITUDE, NO_EVENTS_LONGITUDE)
    private val composeRule = createAndroidComposeRule<MainActivity2>()

    @get:Rule
    val rules: RuleChain = RuleChain
        .outerRule(permissions)
        .around(signedInTestUserRule())
        .around(mockLocation)
        .around(beforeActivityRule { resetUserInterest() })
        .around(composeRule)

    @Test
    // Section 4.2 — View Event Recommendations: failure 2b (no matching events).
    fun showsNoEventsMessageWhenNothingMatches() {
        assertTrue(
            "Expected no seeded events near the test location.",
            backendHasNoEvents(),
        )

        composeRule.waitForText("No events found")

        composeRule.onNodeWithText("No events found").assertIsDisplayed()
        composeRule.onNodeWithText("Refresh").assertIsDisplayed()
    }

    private fun backendHasNoEvents(): Boolean = runBlocking {
        EventsApi(realBackendClient())
            .getEvents(REAL_BACKEND_USER_ID, NO_EVENTS_LATITUDE, NO_EVENTS_LONGITUDE, 1, 1)
            .isEmpty()
    }

    private companion object {
        const val NO_EVENTS_LATITUDE = 0.0
        const val NO_EVENTS_LONGITUDE = 0.0
    }
}
