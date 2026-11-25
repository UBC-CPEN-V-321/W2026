package com.exploreUBC.cpen321application.e2e.events

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.exploreUBC.cpen321application.MainActivity2
import com.exploreUBC.cpen321application.testutil.beforeActivityRule
import com.exploreUBC.cpen321application.testutil.grantLocationPermissionRule
import com.exploreUBC.cpen321application.testutil.signedInTestUserRule
import com.exploreUBC.cpen321application.testutil.resetUserInterest
import com.exploreUBC.cpen321application.testutil.scrollToText
import com.exploreUBC.cpen321application.testutil.waitForText
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain

/**
 * Live Events E2E tests against the real backend. Run with `npm run test:e2e` from `backend/`, with the backend
 * on the E2E database and the emulator location set to UBC (see documentation/Testing.md, Section 4).
 */
class LiveEventsE2ETest {
    private val permissions = grantLocationPermissionRule()
    private val composeRule = createAndroidComposeRule<MainActivity2>()

    @get:Rule
    val rules: RuleChain = RuleChain
        .outerRule(permissions)
        .around(signedInTestUserRule())
        .around(beforeActivityRule { resetUserInterest() })
        .around(composeRule)

    @Test
    // Section 4.2 — View Event Recommendations: steps 1–6.
    fun viewEventRecommendationsShowsRankedSeededEvents() {
        composeRule.waitForText("E2E Event 01")

        composeRule.onNodeWithText("Live Events").assertIsDisplayed()
        composeRule.onNodeWithText("E2E Event 01").assertIsDisplayed()
        composeRule.onAllNodesWithText("Sports").onFirst().assertIsDisplayed()
        composeRule.onAllNodesWithText("E2E Venue, Vancouver").onFirst().assertIsDisplayed()
        composeRule.onAllNodesWithText("km away", substring = true).onFirst().assertIsDisplayed()
        composeRule.onAllNodesWithText("Add to itinerary").onFirst().assertIsDisplayed()
        // Page 1 holds 20 events; the 21st is not loaded yet.
        composeRule.onAllNodesWithText("E2E Event 21").assertCountEquals(0)
    }

    @Test
    // Section 4.2 — View Event Recommendations: Load more (21 seeded events, page size 20).
    fun loadMoreAppendsTheLastEventAndHidesTheButton() {
        composeRule.waitForText("E2E Event 01")
        composeRule.scrollToText("Load more")
        composeRule.onNodeWithText("Load more").performClick()

        composeRule.scrollToText("E2E Event 21")
        composeRule.onNodeWithText("E2E Event 21").assertIsDisplayed()
        composeRule.onAllNodesWithText("Load more").assertCountEquals(0)
    }

    @Test
    // Section 4.2 — Refresh After a Preference Change: interest outdoors -> live music.
    fun changingInterestShowsSnackbarAndLinksToNewEvents() {
        composeRule.waitForText("E2E Event 01")

        composeRule.onNodeWithTag("navigation_Profile").performClick()
        composeRule.waitUntil(20_000) {
            composeRule.onAllNodesWithTag("profile_interest_dropdown").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithTag("profile_interest_dropdown").performScrollTo().performClick()
        composeRule.onNodeWithTag("profile_interest_live_music").performClick()
        composeRule.onNodeWithTag("profile_save").performScrollTo().performClick()

        composeRule.waitForText("3 new events near you")
        composeRule.onNodeWithText("View").performClick()

        composeRule.waitForText("E2E Music 01")
        composeRule.onNodeWithText("E2E Music 01").assertIsDisplayed()
    }
}
