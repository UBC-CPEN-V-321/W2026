package com.exploreUBC.cpen321application.e2e.events

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.exploreUBC.cpen321application.BuildConfig
import com.exploreUBC.cpen321application.MainActivity2
import com.exploreUBC.cpen321application.data.events.EventsApi
import com.exploreUBC.cpen321application.testutil.REAL_BACKEND_USER_ID
import com.exploreUBC.cpen321application.testutil.grantLocationPermissionRule
import com.exploreUBC.cpen321application.testutil.resetUserInterest
import com.exploreUBC.cpen321application.testutil.waitForText
import kotlinx.coroutines.runBlocking
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain

/**
 * Empty state of Live Events. Needs a database without events: run `npm run e2e:seed -- empty`
 * first. With events seeded the test is skipped, so a full suite run is not affected.
 */
class LiveEventsEmptyStateE2ETest {
    private val permissions = grantLocationPermissionRule()
    private val composeRule = createAndroidComposeRule<MainActivity2>()

    @get:Rule
    val rules: RuleChain = RuleChain.outerRule(permissions).around(composeRule)

    @Before
    fun resetUser() {
        resetUserInterest()
    }

    @Test
    // Section 4.2 — View Event Recommendations: failure 2b (no matching events).
    fun showsNoEventsMessageWhenNothingMatches() {
        assumeTrue("Seed the database with `npm run e2e:seed -- empty`.", backendHasNoEvents())

        composeRule.waitForText("No events found")

        composeRule.onNodeWithText("No events found").assertIsDisplayed()
        composeRule.onNodeWithText("Refresh").assertIsDisplayed()
    }

    private fun backendHasNoEvents(): Boolean = runBlocking {
        EventsApi(BuildConfig.API_BASE_URL)
            .getEvents(REAL_BACKEND_USER_ID, UBC_LATITUDE, UBC_LONGITUDE, 1, 1)
            .isEmpty()
    }

    private companion object {
        const val UBC_LATITUDE = 49.2606
        const val UBC_LONGITUDE = -123.246
    }
}
